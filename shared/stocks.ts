export const STARTING_CASH_CENTS = 1_000_000;
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

export type SymbolCode = (typeof STOCKS)[number]['symbol'];
export const symbols = STOCKS.map(s => s.symbol);
export const isSymbol = (value: unknown): value is SymbolCode =>
  typeof value === 'string' && symbols.includes(value as SymbolCode);

export type Quote = {
  symbol: SymbolCode; name: string; priceCents: number; previousCloseCents: number;
  changePct: number; fetchedAt: number; source: 'finnhub'; stale: boolean; marketOpen: boolean;
};
export type Position = { symbol: SymbolCode; shares: number; costBasisCents: number; marketValueCents: number; profitCents: number; quote: Quote };
export type Portfolio = { userId: string; displayName: string; cashCents: number; equityCents: number; investedCents: number; profitCents: number; positions: Position[] };
export type Leader = { userId: string; displayName: string; equityCents: number; changeCents: number };
export type Trade = { id: number; symbol: SymbolCode; side: 'BUY' | 'SELL'; shares: number; priceCents: number; executedAt: number };
