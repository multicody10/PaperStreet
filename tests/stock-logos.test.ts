import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { STOCKS } from '../shared/stocks';

const read=(path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('each available ticker has a bundled SVG logo mapped by the shared StockMark component', () => {
  const component = read('src/StockMark.tsx');
  for (const {symbol} of STOCKS) {
    const icon = read('src/assets/stock-logos/' + symbol.toLowerCase() + '.svg');
    assert.match(icon, /<svg\b/);
    assert.match(icon, /<\/svg>/);
    assert.match(icon, /viewBox=/);
    assert.match(component, new RegExp('\\b' + symbol + ": new URL\\('\\./assets/stock-logos/" + symbol.toLowerCase() + "\\.svg'"));
    assert.doesNotMatch(icon, /<script|onload=|href="https?:/i);
  }
  assert.match(component, /<img src=\{logos\[symbol\]\}/);
  assert.doesNotMatch(component, /cdn\.|https?:/);
});
test('watchlist, market directory, stock header, related stocks and holdings use the same logo component', () => {
  const overview = read('src/OverviewPanels.tsx');
  const dashboard = read('src/TradingDashboard.tsx');
  const trade = read('src/TradeTerminal.tsx');
  const stock = read('src/StockTerminal.tsx');
  assert.match(overview, /<StockMark symbol=\{symbol\}/);
  assert.match(dashboard, /<StockMark symbol=\{q.symbol\}/);
  assert.match(dashboard, /<StockMark symbol=\{pos.symbol\}/);
  assert.match(trade, /<StockMark symbol=\{q.symbol\}/);
  assert.match(stock, /<StockMark symbol=\{p.symbol\} className="stock-terminal-logo"/);
  assert.match(stock, /<StockMark symbol=\{q.symbol\} className="stock-terminal-peer-badge"/);
  assert.doesNotMatch(trade, /q\.symbol\.slice\(0,2\)/);
  assert.doesNotMatch(stock, /p\.symbol\.slice\(0,2\)/);
  const styles=read('src/stock-logos.css');
  assert.match(styles, /stock-mark-logo img/);
  assert.match(read('src/main.tsx'), /import '\.\/stock-logos\.css'/);
});
test('calendar popover is wider with readable day labels and footer at target desktop height', () => {
  const popup=read('src/MarketSchedule.tsx');
  const css=read('src/market-schedule.css');
  assert.match(popup, /Math\.min\(446, window\.innerWidth - 16\)/);
  assert.match(css, /width:min\(446px,calc\(100vw - 16px\)\)/);
  assert.match(css, /font:14px\/1\.45 Roboto/);
  assert.match(css, /height:40px;display:grid/);
  assert.match(css, /\.market-hours-explain\{color:#c4d0dc;font-size:14px;line-height:1\.6/);
  assert.match(css, /max-height:calc\(100dvh - 16px\);overflow:hidden/);
});
