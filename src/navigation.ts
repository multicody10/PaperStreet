import { isSymbol, type SymbolCode } from '../shared/stocks';

export type Page = 'dashboard' | 'trade' | 'portfolio' | 'leaderboard' | 'challenges';
export type View = Page | 'stock';
export type Route = { view: View; symbol: SymbolCode };

const pages = new Set<Page>(['dashboard', 'trade', 'portfolio', 'leaderboard', 'challenges']);
export function parseAppHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  const match = /^trade\/([A-Z]+)$/.exec(path);
  if (match && isSymbol(match[1])) return { view: 'stock', symbol: match[1] };
  if (path === 'history') return { view: 'portfolio', symbol: 'AAPL' }; // Preserve old deep links.
  if (pages.has(path as Page)) return { view: path as Page, symbol: 'AAPL' };
  return { view: 'dashboard', symbol: 'AAPL' };
}
export function appHash(view: View, symbol: SymbolCode = 'AAPL'): string {
  return view === 'stock' ? `#/trade/${symbol}` : `#/${view}`;
}
