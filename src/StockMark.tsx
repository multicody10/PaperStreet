import type { SymbolCode } from '../shared/stocks';

// Vite bundles these static file URLs; Node-based component tests can import
// StockMark without needing an SVG module loader or a live image service.
const logos: Record<SymbolCode, string> = {
  AAPL: new URL('./assets/stock-logos/aapl.svg', import.meta.url).href,
  MSFT: new URL('./assets/stock-logos/msft.svg', import.meta.url).href,
  NVDA: new URL('./assets/stock-logos/nvda.svg', import.meta.url).href,
  AMZN: new URL('./assets/stock-logos/amzn.svg', import.meta.url).href,
  GOOGL: new URL('./assets/stock-logos/googl.svg', import.meta.url).href,
  META: new URL('./assets/stock-logos/meta.svg', import.meta.url).href,
  TSLA: new URL('./assets/stock-logos/tsla.svg', import.meta.url).href,
  AMD: new URL('./assets/stock-logos/amd.svg', import.meta.url).href,
  NFLX: new URL('./assets/stock-logos/nflx.svg', import.meta.url).href,
  DIS: new URL('./assets/stock-logos/dis.svg', import.meta.url).href,
  INTC: new URL('./assets/stock-logos/intc.svg', import.meta.url).href,
  SPY: new URL('./assets/stock-logos/spy.svg', import.meta.url).href,
};

// One consistent logo renderer across the watchlist, markets and stock pages.
export function StockMark({symbol, className = ''}: {symbol: SymbolCode; className?: string}) {
  return <span aria-hidden="true" className={['stock-mark', 'stock-mark-logo',
    'mark-' + symbol.toLowerCase(), className].filter(Boolean).join(' ')}>
    <img src={logos[symbol]} alt="" decoding="async" draggable={false}/>
  </span>;
}
