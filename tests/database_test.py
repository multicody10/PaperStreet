"""Verify SQLite trade triggers using the same migration consumed by Cloudflare D1."""
import pathlib
import sqlite3
import unittest

SQL = (pathlib.Path(__file__).resolve().parents[1] / 'migrations/0001_init.sql').read_text()
STARTING_CASH_MIGRATION = (pathlib.Path(__file__).resolve().parents[1] / 'migrations/0003_starting_cash.sql').read_text()
AVATAR_MIGRATION = (pathlib.Path(__file__).resolve().parents[1] / 'migrations/0004_player_avatars.sql').read_text()
MARKET_MIGRATION = (pathlib.Path(__file__).resolve().parents[1] / 'migrations/0002_real_market.sql').read_text()
COMMAND_MIGRATION = (pathlib.Path(__file__).resolve().parents[1] / 'migrations/0008_portfolio_slash_command.sql').read_text()
GAMEPLAY_MIGRATION = (pathlib.Path(__file__).resolve().parents[1] / 'migrations/0009_after_hours_gameplay.sql').read_text()
UID = '123456789012345678'


class TradeLedgerTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.executescript(SQL)
        self.db.execute('INSERT INTO players(user_id,display_name) VALUES (?,?)', (UID, 'Trader'))

    def order(self, orderid, side, shares, price=10000, symbol='AAPL'):
        self.db.execute('INSERT INTO trades(user_id,client_order_id,symbol,side,shares,price_cents) VALUES (?,?,?,?,?,?)', (UID, orderid, symbol, side, shares, price))

    def balance(self):
        return self.db.execute('SELECT cash_cents FROM players WHERE user_id=?', (UID,)).fetchone()[0]

    def holding(self):
        return self.db.execute('SELECT shares,cost_basis_cents FROM holdings WHERE user_id=? AND symbol=?', (UID, 'AAPL')).fetchone()

    def test_buy_sell_and_weighted_basis(self):
        self.order('a', 'BUY', 3, 10000)
        self.order('b', 'BUY', 2, 20000)
        self.assertEqual(self.balance(), 930000)
        self.assertEqual(self.holding(), (5, 70000))
        self.order('c', 'SELL', 2, 15000)
        self.assertEqual(self.balance(), 960000)
        self.assertEqual(self.holding(), (3, 42000))
        self.order('d', 'SELL', 3, 15000)
        self.assertEqual(self.balance(), 1005000)
        self.assertIsNone(self.holding())

    def test_insufficient_cash_and_shares_never_mutate_ledger(self):
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'Insufficient cash'):
            self.order('a', 'BUY', 101)
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'Insufficient shares'):
            self.order('b', 'SELL', 1)
        self.assertEqual(self.balance(), 1000000)
        self.assertEqual(self.db.execute('SELECT count(*) FROM trades').fetchone()[0], 0)

    def test_starting_cash_migration_preserves_legacy_accounts(self):
        self.db.executescript(STARTING_CASH_MIGRATION)
        self.assertEqual(self.db.execute('SELECT cash_cents, starting_cash_cents FROM players WHERE user_id=?', (UID,)).fetchone(), (1000000, 1000000))
        new_user = '987654321098765432'
        self.db.execute('INSERT INTO players(user_id,display_name,cash_cents,starting_cash_cents) VALUES (?,?,?,?)', (new_user, 'New Player', 100000, 100000))
        self.assertEqual(self.db.execute('SELECT cash_cents, starting_cash_cents FROM players WHERE user_id=?', (new_user,)).fetchone(), (100000, 100000))
        self.db.execute('INSERT INTO players(user_id,display_name,cash_cents,starting_cash_cents) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name', (new_user, 'Updated Player', 100000, 100000))
        self.assertEqual(self.db.execute('SELECT cash_cents, starting_cash_cents FROM players WHERE user_id=?', (new_user,)).fetchone(), (100000, 100000))

    def test_avatar_metadata_sync_preserves_existing_balance_and_positions(self):
        self.order('before-avatar', 'BUY', 2)
        self.db.executescript(STARTING_CASH_MIGRATION)
        self.db.executescript(AVATAR_MIGRATION)
        self.assertEqual(self.db.execute('SELECT avatar_hash, avatar_discriminator FROM players WHERE user_id=?', (UID,)).fetchone(), (None, None))
        self.db.execute("""
            INSERT INTO players(user_id,display_name,cash_cents,starting_cash_cents,avatar_hash,avatar_discriminator)
            VALUES (?,?,?,?,?,?)
            ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name,
            avatar_hash=excluded.avatar_hash, avatar_discriminator=excluded.avatar_discriminator
        """, (UID, 'Renamed Trader', 100000, 100000, 'f' * 32, '1234'))
        self.assertEqual(self.db.execute('SELECT display_name,cash_cents,starting_cash_cents,avatar_hash,avatar_discriminator FROM players WHERE user_id=?', (UID,)).fetchone(),
                         ('Renamed Trader', 980000, 1000000, 'f' * 32, '1234'))
        self.assertEqual(self.holding(), (2, 20000))
        self.db.execute("""
            INSERT INTO players(user_id,display_name,cash_cents,starting_cash_cents,avatar_hash,avatar_discriminator)
            VALUES (?,?,?,?,?,?)
            ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name,
            avatar_hash=excluded.avatar_hash, avatar_discriminator=excluded.avatar_discriminator
        """, (UID, 'Renamed Trader', 100000, 100000, None, None))
        self.assertEqual(self.db.execute('SELECT avatar_hash,avatar_discriminator FROM players WHERE user_id=?', (UID,)).fetchone(), (None, None))
        self.assertEqual(self.balance(), 980000)

    def test_all_chart_history_survives_and_sampling_uses_real_observations(self):
        self.db.executescript(MARKET_MIGRATION)
        earliest = 1730000000
        source = [(earliest + day * 86400, 10000 + day * 7) for day in range(370)]
        self.db.executemany(
            'INSERT INTO quote_history(symbol,observed_at,price_cents) VALUES (?,?,?)',
            [('AAPL', at, cents) for at, cents in source],
        )
        self.db.execute(
            'INSERT INTO quote_history(symbol,observed_at,price_cents) VALUES (?,?,?)',
            ('MSFT', earliest, 50000),
        )
        oldest = self.db.execute(
            'SELECT observed_at FROM quote_history WHERE symbol=? ORDER BY observed_at ASC LIMIT 1',
            ('AAPL',),
        ).fetchone()[0]
        self.assertEqual(oldest, earliest)
        bucket_seconds = 2 * 86400
        result = self.db.execute("""
            WITH buckets AS (
                SELECT MAX(observed_at) AS at FROM quote_history
                WHERE symbol=? AND observed_at>=? AND observed_at<=?
                GROUP BY CAST(observed_at / ? AS INTEGER)
            )
            SELECT history.observed_at, history.price_cents
            FROM buckets JOIN quote_history history
                ON history.symbol=? AND history.observed_at=buckets.at
            ORDER BY history.observed_at ASC LIMIT 300
        """, ('AAPL', earliest, source[-1][0], bucket_seconds, 'AAPL')).fetchall()
        self.assertGreater(len(result), 170)
        self.assertLessEqual(len(result), 190)
        self.assertTrue(all(point in source for point in result))
        self.assertEqual(self.db.execute(
            'SELECT COUNT(*) FROM quote_history WHERE symbol=?', ('AAPL',)
        ).fetchone()[0], 370)
        self.assertEqual(self.db.execute(
            'SELECT COUNT(*) FROM quote_history WHERE symbol=?', ('MSFT',)
        ).fetchone()[0], 1)

    def test_portfolio_slash_registration_state_keeps_trade_ledger_intact(self):
        self.db.executescript(COMMAND_MIGRATION)
        self.db.execute("""
            INSERT INTO discord_command_registry(name,version,checked_at,last_attempt_at,last_result)
            VALUES (?,?,?,?,?)
        """, ('portfolio', 1, 1000, 1000, 'registered'))
        self.assertEqual(self.db.execute(
            'SELECT version,last_result FROM discord_command_registry WHERE name=?',
            ('portfolio',)
        ).fetchone(), (1, 'registered'))
        self.assertEqual(self.balance(), 1000000)
        self.order('after-command', 'BUY', 1)
        self.assertEqual(self.balance(), 990000)

    def test_orders_idempotent(self):
        self.order('order-id', 'BUY', 1)
        with self.assertRaises(sqlite3.IntegrityError):
            self.order('order-id', 'BUY', 1)
        self.assertEqual(self.balance(), 990000)
        self.assertEqual(self.holding(), (1, 10000))


    def test_after_hours_orders_do_not_change_ledger_until_filled(self):
        self.db.executescript(GAMEPLAY_MIGRATION)
        self.db.execute("""
            INSERT INTO queued_orders(user_id,client_order_id,symbol,side,shares,kind,trigger_price_cents)
            VALUES (?,?,?,?,?,?,?)
        """, (UID, 'queue-1', 'AAPL', 'BUY', 2, 'LIMIT', 9500))
        self.assertEqual(self.balance(), 1000000)
        self.assertEqual(self.db.execute('SELECT last_checked_at FROM queued_orders WHERE client_order_id=?', ('queue-1',)).fetchone()[0], 0)
        self.assertIsNone(self.holding())
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("""
                INSERT INTO queued_orders(user_id,client_order_id,symbol,side,shares,kind,trigger_price_cents)
                VALUES (?,?,?,?,?,?,?)
            """, (UID, 'queue-1', 'AAPL', 'BUY', 2, 'LIMIT', 9500))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("""
                INSERT INTO queued_orders(user_id,client_order_id,symbol,side,shares,kind,trigger_price_cents)
                VALUES (?,?,?,?,?,?,?)
            """, (UID, 'bad-kind', 'AAPL', 'BUY', 2, 'MARKET', 10000))
        self.order('queue-1', 'BUY', 2, 9400)
        self.assertEqual(self.balance(), 981200)
        self.assertEqual(self.holding(), (2, 18800))
        with self.assertRaises(sqlite3.IntegrityError):
            self.order('queue-1', 'BUY', 2, 9400)
        self.assertEqual(self.balance(), 981200)

    def test_predictions_unique_per_session_and_achievements_persistent(self):
        self.db.executescript(GAMEPLAY_MIGRATION)
        self.db.execute("""
            INSERT INTO predictions(user_id,symbol,direction,target_date,base_price_cents)
            VALUES (?,?,?,?,?)
        """, (UID, 'AAPL', 'UP', '2026-11-23', 10000))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("""
                INSERT INTO predictions(user_id,symbol,direction,target_date,base_price_cents)
                VALUES (?,?,?,?,?)
            """, (UID, 'AAPL', 'DOWN', '2026-11-23', 10000))
        self.db.execute("""
            UPDATE predictions SET outcome='CORRECT',points=10,close_price_cents=10200 WHERE user_id=?
        """, (UID,))
        self.assertEqual(self.db.execute("SELECT SUM(points) FROM predictions WHERE user_id=?", (UID,)).fetchone()[0], 10)
        self.db.execute("INSERT OR IGNORE INTO player_achievements(user_id,code) VALUES (?,?)", (UID, 'first_prediction'))
        self.db.execute("INSERT OR IGNORE INTO player_achievements(user_id,code) VALUES (?,?)", (UID, 'first_prediction'))
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM player_achievements WHERE user_id=?", (UID,)).fetchone()[0], 1)


if __name__ == '__main__':
    unittest.main()
