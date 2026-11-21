import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Quote, SymbolCode } from '../shared/stocks';
import { selectTradeQuotes, selectTradeMovers } from '../src/TradeTerminal';

const quote=(symbol:SymbolCode,priceCents:number,changePct:number):Quote=>({
  symbol,name:symbol==='AAPL'?'Apple':symbol==='MSFT'?'Microsoft':symbol==='NVDA'?'NVIDIA':symbol==='SPY'?'S&P 500 ETF':symbol,
  priceCents,previousCloseCents:Math.round(priceCents/(1+changePct/100)),
  changePct,fetchedAt:1795000000,source:'finnhub',stale:false,marketOpen:false,
});
const quotes:Quote[]=[quote('NVDA',19800,2.5),quote('MSFT',42500,-.8),quote('AAPL',21100,1.2),quote('SPY',60000,.5)];
const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('stock table filters only supported quote types and names',()=>{
  assert.deepEqual(selectTradeQuotes(quotes,'all','', 'symbol').map(x=>x.symbol),['AAPL','MSFT','NVDA','SPY']);
  assert.deepEqual(selectTradeQuotes(quotes,'stocks','', 'symbol').map(x=>x.symbol),['AAPL','MSFT','NVDA']);
  assert.deepEqual(selectTradeQuotes(quotes,'etf','', 'symbol').map(x=>x.symbol),['SPY']);
  assert.deepEqual(selectTradeQuotes(quotes,'all','micro','symbol').map(x=>x.symbol),['MSFT']);
  assert.deepEqual(selectTradeQuotes(quotes,'all',' nvDa ','symbol').map(x=>x.symbol),['NVDA']);
  assert.deepEqual(selectTradeQuotes(quotes,'all','missing','symbol'),[]);
});
test('sorting uses actual prices and changes without modifying source',()=>{
  assert.deepEqual(selectTradeQuotes(quotes,'all','', 'change').map(x=>x.symbol),['NVDA','AAPL','SPY','MSFT']);
  assert.deepEqual(selectTradeQuotes(quotes,'all','', 'price').map(x=>x.symbol),['SPY','MSFT','AAPL','NVDA']);
  assert.deepEqual(quotes.map(x=>x.symbol),['NVDA','MSFT','AAPL','SPY']);
});
test('movers tabs use current quote percent change',()=>{
  assert.deepEqual(selectTradeMovers(quotes,'gainers').map(x=>x.symbol),['NVDA','AAPL','SPY']);
  assert.deepEqual(selectTradeMovers(quotes,'losers').map(x=>x.symbol),['MSFT']);
  assert.deepEqual(selectTradeMovers(quotes,'all').map(x=>x.symbol),['NVDA','AAPL','MSFT','SPY']);
});
test('market overview and ticket only use supported quote fields',()=>{
  const trade=read('src/TradeTerminal.tsx');
  const css=read('src/trade-terminal.css');
  const app=read('src/main.tsx');
  assert.match(trade,/className="trade-market-overview"/);
  assert.match(trade,/<PriceChart key=\{p\.selectedSymbol\+':'\+p\.range\}/);
  assert.match(trade,/selected\.sessionBar\.openCents/);
  assert.match(trade,/selected\.previousCloseCents/);
  assert.match(trade,/\.priceCents-q\.previousCloseCents/);
  assert.match(trade,/className="trade-market-list"/);
  assert.match(trade,/className="panel trade-market-breadth"/);
  assert.match(trade,/className="panel trade-terminal-ticket"/);
  assert.match(trade,/onClick=\{p\.execute\}/);
  assert.doesNotMatch(trade,/marketCap|market_cap|volume|sectorPerformance|fictitious|Math\.random/);
  assert.match(app,/tab === 'trade' \? <TradeTerminal/);
  assert.match(app,/view === 'dashboard' \|\| view === 'trade' \|\| view === 'portfolio'/);
  assert.match(app,/tab !== 'stock' && tab !== 'trade' && tab !== 'dashboard'/);
  assert.match(css,/\.trade-market-table-row/);
  assert.match(css,/\.trade-terminal-rail/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/\.trade-terminal\[data-section="order"\] \.trade-terminal-ticket/);
});
test('dashboard no longer mounts recent-trades summary or a trading ticket',()=>{
  const dashboard=read('src/TradingDashboard.tsx');
  const css=read('src/trade-terminal.css');
  assert.doesNotMatch(dashboard,/DashTicket|className="terminal-order"|terminal-count|Recent trades/);
  assert.match(dashboard,/terminal-bottom-activity/);
  assert.match(css,/\.terminal-summary\{grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)!important\}/);
  assert.match(css,/\.terminal-middle\{grid-template-columns:minmax\(195px,\.81fr\) minmax\(0,2\.6fr\)!important\}/);
  assert.match(dashboard,/setSection\('chart'\)/);
});
