"""Verify SQLite trade triggers using the same migration consumed by Cloudflare D1."""
import pathlib
import sqlite3
import unittest

SQL = (pathlib.Path(__file__).resolve().parents[1] / 'migrations/0001_init.sql').read_text()
STARTING_CASH_MIGRATION = (pathlib.Path(__file__).resolve().parents[1] / 'migrations/0003_starting_cash.sql').read_text()
AVATAR_MIGRATION = (pathlib.Path(__file__).resolve().parents[1] / 'migrations/0004_player_avatars.sql').read_text()
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

    def test_orders_idempotent(self):
        self.order('order-id', 'BUY', 1)
        with self.assertRaises(sqlite3.IntegrityError):
            self.order('order-id', 'BUY', 1)
        self.assertEqual(self.balance(), 990000)
        self.assertEqual(self.holding(), (1, 10000))


if __name__ == '__main__':
    unittest.main()
