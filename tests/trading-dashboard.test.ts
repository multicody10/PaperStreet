import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('src/main.tsx');
const dashboard=read('src/TradingDashboard.tsx');
const terminal=read('src/terminal.css');
const goals=read('src/Challenges.tsx');
const stocks=read('src/StockPredictions.tsx');
const trade=read('src/TradeTerminal.tsx');
const tradeCss=read('src/trade-terminal.css');

test('the supplied reference drives a unified dark navy and cyan UI across all routes',()=>{
  assert.match(app,/import '\.\/terminal\.css';/);
  assert.match(terminal, /--bg:#080c15/);
  assert.match(terminal, /--surface:#111724/);
  assert.match(terminal, /--cyan:#17bfff/);
  assert.match(terminal, /--red:#ff6075/);
  assert.match(terminal, /--gain:#20e6a1/);
  for(const selector of ['.global-header','.sidebar','.panel','.stock-workspace','.trade-overview',
    '.challenge-layout','.details-stack','.stock-prediction-panel','.terminal-dashboard','.mobile-nav'])
    assert.ok(terminal.includes(selector),selector);
  assert.match(terminal,/@media \(max-width:760px\)/);
  assert.match(terminal,/\.terminal-dashboard > \.screen-tabs\{display:none\}/);
});

test('terminal dashboard shows all screenshot-inspired sections with real-backed figures',()=>{
  for(const token of ['terminal-summary','terminal-middle','terminal-lower','terminal-equity',
    'terminal-goal','terminal-watch','terminal-chart-panel',
    'terminal-bottom-goals','terminal-bottom-positions','terminal-bottom-activity',
    'terminal-bottom-allocation','terminal-donut'])
    assert.ok(dashboard.includes(token),token);
  assert.match(dashboard,/STARTING_CASH_CENTS/);
  assert.match(dashboard,/const goal=Math\.round\(initial\*1\.1\)/);
  assert.match(dashboard,/p\.portfolio\?\.positions/);
  assert.match(dashboard,/p\.trades/);
  assert.match(dashboard,/p\.achievements/);
  assert.match(dashboard,/<PriceChart key=\{p\.selectedSymbol\+':'\+p\.range\}/);
  assert.doesNotMatch(dashboard,/terminal-count|terminal-order|DashTicket|Recent trades/);
  assert.match(trade,/className="panel trade-terminal-ticket"/);
  assert.match(trade,/onClick=\{p\.execute\}/);
  assert.doesNotMatch(dashboard,/mock|fake|simulated|Math\.random\(/);
  assert.doesNotMatch(app,/S&P 500|NASDAQ|DOW|Trading Streak/);
});

test('paper order ticket exists on Trade instead of the Dashboard',()=>{
  assert.match(app,/\(tab !== 'stock' && tab !== 'trade'\) \|\| !canSubmitOrder/);
  assert.match(app,/await refresh\(token, tab\)/);
  assert.match(app,/tab === 'trade' \? <TradeTerminal/);
  assert.match(app,/canSubmit=\{canSubmitOrder\}/);
  assert.match(trade,/setOrderKind\(kind==='MARKET'\?\(p\.quote\?\.marketOpen\?'IMMEDIATE':'MARKET'\):kind\)/);
  assert.match(trade,/disabled=\{!p\.canSubmit\|\|p\.pending\}/);
  assert.match(app,/request\('\/api\/orders'/);
  assert.match(app,/request<\{ fillPriceCents\?: number; duplicate\?: boolean \}>\('\/api\/trade'/);
  assert.doesNotMatch(dashboard,/execute:|orderKind:|canSubmit:|DashTicket|terminal-order/);
  assert.match(tradeCss,/\.trade-terminal-rail/);
});

test('header search and tickers use supported symbols and verified quotes only',()=>{
  assert.match(app,/import \{ HISTORY_RANGES, STARTING_CASH_CENTS, STOCKS \}/);
  assert.match(app,/quotes\.find\(q=>q\.symbol===symbol\)/);
  assert.match(app,/STOCKS\.filter\(q=>/);
  assert.match(app,/onKeyDown=\{event=>\{/);
  assert.match(app,/openStock\(q\.symbol\)/);
  assert.match(app,/Quotes pending/);
  assert.match(app,/Markets Closed/);
});

test('mobile dashboard remains viewport locked with operational section selection',()=>{
  assert.match(dashboard,/label="Dashboard sections"/);
  assert.match(dashboard,/data-section=\{section\}/);
  assert.match(dashboard,/setSection\('chart'\)/);
  assert.match(terminal,/\.terminal-dashboard:has\(>\.screen-tabs\)/);
  assert.match(tradeCss,/\.terminal-middle\[data-section="chart"\]>\.terminal-chart-panel/);
  assert.match(terminal,/\.terminal-lower\[data-section="positions"\]>\.terminal-bottom-positions/);
  assert.match(terminal,/\.terminal-lower\[data-section="activity"\]>\.terminal-bottom-activity/);
  assert.match(app,/aria-label="Mobile navigation"/);
});

test('existing stock forecasts, Goals, and dedicated trading pages are retained',()=>{
  assert.match(app,/<StockPredictions key=\{selectedSymbol\}/);
  assert.match(stocks,/predictionsForStock\(predictions,symbol\)/);
  assert.match(goals,/Goals sections/);
  assert.match(app,/<TradeTerminal/);
  assert.match(app,/className="stock-workspace"/);
  assert.match(app,/className=\{tab === 'portfolio' \? 'details-stack portfolio-stack' : 'details-stack'\}/);
});
