-- Retire the removed third-party historical data importer and its quota trackers.
-- Existing Finnhub quote_history, players, holdings, orders and trade records remain intact.
DROP TABLE IF EXISTS historical_provider_pacing;
DROP TABLE IF EXISTS historical_backfill_budget;
DROP TABLE IF EXISTS historical_backfill_state;
DROP TABLE IF EXISTS historical_ohlc;
