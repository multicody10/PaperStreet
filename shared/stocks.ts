export const STARTING_CASH_CENTS = 1_000_000;
export const STOCKS = [
  { symbol: 'AAPL', name: 'Apple', baseCents: 23000 },
  { symbol: 'MSFT', name: 'Microsoft', baseCents: 41000 },
  { symbol: 'NVDA', name: 'NVIDIA', baseCents: 15000 },
  { symbol: 'AMZN', name: 'Amazon', baseCents: 21000 },
  { symbol: 'GOOGL', name: 'Alphabet', baseCents: 18500 },
  { symbol: 'META', name: 'Meta', baseCents: 58000 },
  { symbol: 'TSLA', name: 'Tesla', baseCents: 33000 },
  { symbol: 'AMD', name: 'AMD', baseCents: 16000 },
  { symbol: 'NFLX', name: 'Netflix', baseCents: 89000 },
  { symbol: 'DIS', name: 'Disney', baseCents: 11000 },
  { symbol: 'INTC', name: 'Intel', baseCents: 2600 },
  { symbol: 'SPY', name: 'S&P 500 ETF', baseCents: 60000 },
] as const;

export type SymbolCode = (typeof STOCKS)[number]['symbol'];
export const symbols = STOCKS.map(s => s.symbol);
export const isSymbol = (value: unknown): value is SymbolCode =>
  typeof value === 'string' && symbols.includes(value as SymbolCode);

export type Quote = {
  symbol: SymbolCode; name: string; priceCents: number; previousCloseCents: number;
  changePct: number; fetchedAt: number; source: 'simulated' | 'finnhub'; stale: boolean;
};
export type Position = { symbol: SymbolCode; shares: number; costBasisCents: number; marketValueCents: number; profitCents: number; quote: Quote };
export type Portfolio = { userId: string; displayName: string; cashCents: number; equityCents: number; investedCents: number; profitCents: number; positions: Position[] };
export type Leader = { userId: string; displayName: string; equityCents: number; changeCents: number };
export type Trade = { id: number; symbol: SymbolCode; side: 'BUY' | 'SELL'; shares: number; priceCents: number; executedAt: number };
