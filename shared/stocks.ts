export const STARTING_CASH_CENTS = 100_000;
export const STOCKS = [
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'NVDA', name: 'NVIDIA' },
  { symbol: 'AMZN', name: 'Amazon' },
  { symbol: 'GOOGL', name: 'Alphabet' },
  { symbol: 'META', name: 'Meta' },
  { symbol: 'TSLA', name: 'Tesla' },
  { symbol: 'AMD', name: 'AMD' },
  { symbol: 'NFLX', name: 'Netflix' },
  { symbol: 'DIS', name: 'Disney' },
  { symbol: 'INTC', name: 'Intel' },
  { symbol: 'SPY', name: 'S&P 500 ETF' },
] as const;

export const HISTORY_RANGES = ['1D', '1W', '1M', '3M', '1Y', 'ALL'] as const;
export type HistoryRange = typeof HISTORY_RANGES[number];
export type PriceBar = { openCents: number; highCents: number; lowCents: number; closeCents: number };
export type Candle = PriceBar & { firstAt: number; lastAt: number; samples: number };
export type HistoryBackfill = { code: 'not_configured' | 'intraday_only' | 'pending' |
  'imported' | 'rate_limited' | 'premium_required' | 'invalid_key' | 'provider_error' |
  'invalid_response' | 'quota_exhausted' | 'http_error' | 'network_error' | 'storage_error';
  nextAttemptAt?: number; lastSuccessAt?: number };
export type ChartHistory = { candles: Candle[]; bucketSeconds: number;
  source?: 'finnhub' | 'alphavantage'; resolution?: 'daily' | 'weekly';
  backfill?: HistoryBackfill };

export type SymbolCode = (typeof STOCKS)[number]['symbol'];
export const symbols = STOCKS.map(s => s.symbol);
export const isSymbol = (value: unknown): value is SymbolCode =>
  typeof value === 'string' && symbols.includes(value as SymbolCode);

export type Quote = {
  symbol: SymbolCode; name: string; priceCents: number; previousCloseCents: number;
  changePct: number; fetchedAt: number; source: 'finnhub'; stale: boolean; marketOpen: boolean;
  sessionBar?: PriceBar;
};
export type Position = { symbol: SymbolCode; shares: number; costBasisCents: number; marketValueCents: number; profitCents: number; quote: Quote };
export type Portfolio = { userId: string; displayName: string; cashCents: number; startingCashCents: number; equityCents: number; investedCents: number; profitCents: number; positions: Position[] };
export type Leader = { userId: string; displayName: string; avatarUrl: string; equityCents: number; startingCashCents: number; changeCents: number };
export type Trade = { id: number; symbol: SymbolCode; side: 'BUY' | 'SELL'; shares: number; priceCents: number; executedAt: number };
