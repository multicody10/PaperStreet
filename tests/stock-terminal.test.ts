import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { STOCKS, isSymbol } from '../shared/stocks';
import { appHash, parseAppHash } from '../src/navigation';
import { STOCK_PROFILES } from '../src/stockProfiles';

const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const main=read('src/main.tsx');
const stock=read('src/StockTerminal.tsx');
const trade=read('src/TradeTerminal.tsx');
const styles=read('src/stock-terminal.css');

test('every supported stock and ETF has a valid dedicated trading route and profile',()=>{
  const expected=STOCKS.map(s=>s.symbol).sort();
  assert.deepEqual(Object.keys(STOCK_PROFILES).sort(),expected);
  for(const {symbol} of STOCKS){
    assert.ok(isSymbol(symbol));
    assert.deepEqual(parseAppHash(appHash('stock',symbol)),{view:'stock',symbol});
    assert.ok(STOCK_PROFILES[symbol].companyName.trim().length>5);
    assert.ok(STOCK_PROFILES[symbol].sector.trim().length>4);
    assert.ok(STOCK_PROFILES[symbol].summary.trim().length>25);
    assert.ok(STOCK_PROFILES[symbol].peers.length>0);
    for(const peer of STOCK_PROFILES[symbol].peers){
      assert.ok(isSymbol(peer),symbol+' references unsupported peer '+peer);
      assert.notEqual(peer,symbol,symbol+' cannot be its own peer');
    }
  }
});
test('market-wide Trade is discovery only and opens the stock route',()=>{
  assert.match(main,/tab === 'trade' \? <TradeTerminal/);
  assert.match(main,/tab === 'stock' \? <StockTerminal/);
  assert.match(trade,/const choose=\(symbol:SymbolCode\)=>p\.openStock\(symbol\)/);
  assert.match(trade,/onClick=\{\(\)=>choose\(q\.symbol\)\}/);
  assert.match(trade,/onClick=\{\(\)=>choose\(symbol\)\}/);
  assert.doesNotMatch(trade,/Market movers|Market breadth|Place paper order|TradeOrderTicket|TradeOrder/);
  assert.doesNotMatch(trade,/market-movers|market-breadth|trade-terminal-ticket|execute=|canSubmit=/);
  assert.match(styles,/\.trade-terminal\{display:flex!important/);
});
test('stock page uses real quote, chart, position and own ticker data',()=>{
  assert.match(main,/if \(view === 'stock'\)\s+jobs.push\(request<\{ predictions: Prediction\[\] \}>/);
  assert.match(main,/view === 'dashboard' \|\| view === 'portfolio' \|\| view === 'stock'/);
  assert.match(main,/if \(tab !== 'stock' \|\| !canSubmitOrder/);
  assert.match(stock,/portfolio\?\.positions\.find\(v=>v\.symbol===p\.symbol\)/);
  assert.match(stock,/p\.quote\.priceCents-p\.quote\.previousCloseCents/);
  assert.match(stock,/const session=p\.quote\?\.sessionBar/);
  assert.match(stock,/className="stock-terminal-snapshot"/);
  assert.match(stock,/className="stock-terminal-range-track"/);
  assert.match(stock,/position\.marketValueCents/);
  assert.doesNotMatch(stock,/className="stock-terminal-hero-facts"|Prev\. close|Held shares/);
  assert.match(stock,/key=\{p\.symbol\+':'\+p\.range\}/);
  assert.match(stock,/<StockPredictions key=\{p\.symbol\}/);
  assert.match(stock,/trades\.filter\(t=>t\.symbol===symbol\)/);
  assert.match(stock,/STOCK_PROFILES\[p\.symbol\]/);
  assert.match(stock,/title=\{profile\.companyName\}/);
  assert.match(stock,/className="stock-terminal-name-row"/);
  assert.match(stock,/className="stock-terminal-symbol"/);
  assert.match(stock,/onClick=\{\(\)=>openStock\(q\.symbol\)\}/);
});
test('stock ticket supports buy/sell, market/limit/stop and existing queued execution',()=>{
  assert.match(stock,/p\.side==='BUY'/);
  assert.match(stock,/p\.side==='SELL'/);
  assert.match(stock,/<option value=\{marketValue\}>/);
  assert.match(stock,/<option value="LIMIT">/);
  assert.match(stock,/<option value="STOP">/);
  assert.match(stock,/type="number" min="1" max="100000" step="1"/);
  assert.match(stock,/onClick=\{p\.execute\}/);
  assert.match(stock,/disabled=\{!p\.canSubmit\|\|p\.pending\}/);
  assert.match(main,/request\('\/api\/orders'/);
  assert.match(main,/request<\{ fillPriceCents\?: number; duplicate\?: boolean \}>\('\/api\/trade'/);
});
test('stock desktop and mobile panels remain viewport locked and forecasts accessible',()=>{
  for(const item of ['stock-terminal-hero','stock-terminal-quote-summary','stock-terminal-chart','stock-terminal-ticket',
    'stock-terminal-related','stock-terminal-activity'])
    assert.ok(stock.includes(item),item);
  assert.doesNotMatch(stock,/<SectionTabs|label="Stock panels"/);
  assert.match(stock,/className="stock-terminal-header-actions"/);
  assert.match(stock,/className="stock-terminal-menu"/);
  assert.match(stock,/p\.setPane\('order'\)/);
  assert.doesNotMatch(stock,/p\.setPane\('facts'\)/);
  assert.doesNotMatch(stock,/Key metrics|stock-terminal-about|stock-terminal-metrics|stock-terminal-bottom|stock-terminal-hero-action/);
  assert.doesNotMatch(stock,/About \{p\.symbol\}/);
  assert.match(stock,/Buy or sell shares/);
  assert.match(stock,/p\.setPane\('predict'\)/);
  assert.match(stock,/p\.setPane\('chart'\)/);
  assert.match(styles,/\.stock-terminal\s*\{[\s\S]*?overflow:hidden/);
  assert.match(styles,/@media\(max-width:760px\)/);
  assert.match(styles,/\.stock-terminal\[data-pane="chart"\] \.stock-terminal-chart/);
  assert.match(styles,/\.stock-terminal\[data-pane="order"\] \.stock-terminal-ticket/);
  assert.match(read('src/stock-page-cleanup.css'),/grid-template-rows:/);
  assert.match(read('src/stock-page-cleanup.css'),/\.stock-terminal>\.stock-terminal-stage\{\s*grid-area:3\/1\/4\/2!important/);
  assert.match(read('src/main.tsx'),/import '\.\/stock-page-cleanup\.css'/);
  assert.match(styles,/\.stock-terminal\[data-pane="predict"\] \.stock-prediction-panel/);
  assert.match(styles,/@media\(min-width:761px\) and \(max-height:735px\)/);
  assert.match(styles,/@media\(max-width:760px\) and \(max-height:570px\)/);
});
