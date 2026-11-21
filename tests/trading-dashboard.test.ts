import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('src/main.tsx');
const calendar=read('src/MarketSchedule.tsx');
const dashboard=read('src/TradingDashboard.tsx');
const terminal=read('src/terminal.css');
const goals=read('src/Challenges.tsx');
const stocks=read('src/StockPredictions.tsx');
const trade=read('src/TradeTerminal.tsx');
const tradeCss=read('src/trade-terminal.css');
const stock=read('src/StockTerminal.tsx');
const dark=read('src/goals-portfolio.css');

test('existing terminal structure remains valid under the new black theme',()=>{
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
  assert.match(app,/import '\.\/goals-portfolio\.css';/);
  assert.match(dark,/--bg:#060911/);
  assert.match(dark,/--card-edge:#374355/);
  assert.match(dark,/border:1px solid #374458!important/);
});

test('terminal dashboard keeps real-backed overview, chart and three lower sections',()=>{
  for(const token of ['terminal-summary','terminal-middle','terminal-lower','terminal-equity',
    'terminal-goal','terminal-watch','terminal-chart-panel',
    'terminal-bottom-goals','terminal-bottom-positions','terminal-bottom-portfolio',
    'terminal-bottom-allocation','terminal-donut'])
    assert.ok(dashboard.includes(token),token);
  assert.match(dashboard,/STARTING_CASH_CENTS/);
  assert.match(dashboard,/const goal=Math\.round\(initial\*1\.1\)/);
  assert.match(dashboard,/p\.portfolio\?\.positions/);
  assert.match(dashboard,/p\.trades/);
  assert.match(dashboard,/p\.achievements/);
  assert.match(dashboard,/<PriceChart key=\{p\.selectedSymbol\+':'\+p\.range\}/);
  assert.doesNotMatch(dashboard,/terminal-count|terminal-order|DashTicket|Recent trades/);
  assert.match(stock,/className="panel stock-terminal-ticket"/);
  assert.match(stock,/onClick=\{p\.execute\}/);
  assert.doesNotMatch(dashboard,/mock|fake|simulated|Math\.random\(/);
  assert.doesNotMatch(app,/S&P 500|NASDAQ|DOW|Trading Streak/);
});

test('paper order tickets exist only on dedicated stock pages',()=>{
  assert.match(app,/if \(tab !== 'stock' \|\| !canSubmitOrder/);
  assert.match(app,/await refresh\(token, tab\)/);
  assert.match(app,/tab === 'stock' \? <StockTerminal/);
  assert.match(app,/canSubmit=\{canSubmitOrder\}/);
  assert.match(stock,/value=\{p\.orderKind\}/);
  assert.match(stock,/disabled=\{!p\.canSubmit\|\|p\.pending\}/);
  assert.match(app,/request\('\/api\/orders'/);
  assert.match(app,/request<\{ fillPriceCents\?: number; duplicate\?: boolean \}>\('\/api\/trade'/);
  assert.doesNotMatch(dashboard,/execute:|orderKind:|canSubmit:|DashTicket|terminal-order/);
  assert.doesNotMatch(trade,/TradeOrderTicket|trade-terminal-ticket|trade-market-movers|trade-market-breadth/);
});

test('header search and tickers use supported symbols and verified quotes only',()=>{
  assert.match(app,/import \{ STARTING_CASH_CENTS, STOCKS \}/);
  assert.match(app,/quotes\.find\(q=>q\.symbol===symbol\)/);
  assert.match(app,/STOCKS\.filter\(q=>/);
  assert.match(app,/onKeyDown=\{event=>\{/);
  assert.match(app,/openStock\(q\.symbol\)/);
  assert.match(app,/<MarketSchedule marketOpen=/);
  assert.match(calendar,/Quotes pending/);
  assert.match(calendar,/Markets Closed/);
  assert.match(calendar,/nextMarketOpening\(now\)/);
});

test('mobile dashboard remains viewport locked with operational section selection',()=>{
  assert.match(dashboard,/label="Dashboard sections"/);
  assert.match(dashboard,/data-section=\{section\}/);
  assert.match(dashboard,/setSection\('chart'\)/);
  assert.match(terminal,/\.terminal-dashboard:has\(>\.screen-tabs\)/);
  assert.match(tradeCss,/\.terminal-middle\[data-section="chart"\]>\.terminal-chart-panel/);
  assert.match(terminal,/\.terminal-lower\[data-section="positions"\]>\.terminal-bottom-positions/);
  assert.match(dashboard,/className="terminal-portfolio-switch"/);
  assert.match(dashboard,/setActivityMode\('trades'\)/);
  assert.doesNotMatch(dashboard,/className="terminal-bottom-activity"/);
  assert.match(app,/aria-label="Mobile navigation"/);
});

test('existing stock forecasts, Goals, and dedicated trading pages are retained',()=>{
  assert.match(stock,/<StockPredictions key=\{p\.symbol\}/);
  assert.match(stocks,/predictionsForStock\(predictions,symbol\)/);
  assert.match(goals,/Goals panels/);
  assert.match(app,/<TradeTerminal/);
  assert.match(app,/<StockTerminal/);
  assert.match(app,/className=\{tab === 'portfolio' \? 'details-stack portfolio-stack' : 'details-stack'\}/);
});

test('watchlist only includes symbols in shares currently held, with a clear empty state',()=>{
  assert.match(dashboard,/openPositions\.filter\(position=>position\.shares>0\)/);
  assert.match(dashboard,/p\.quotes\.find\(q=>q\.symbol===position\.symbol\)\?\?position\.quote/);
  assert.match(dashboard,/No shares held yet\. Buy a stock to watch it here\./);
  assert.doesNotMatch(dashboard,/STOCKS\.map\(stock=>p\.quotes/);
});
test('dashboard combines the positions and recent paper trades into a single card',()=>{
  assert.match(dashboard,/title="Positions & trades"/);
  assert.match(dashboard,/aria-label="Positions and trades"/);
  assert.match(dashboard,/key="positions"/);
  assert.match(dashboard,/key="trades"/);
  assert.match(dashboard,/title="Goals & achievements"/);
  assert.match(dashboard,/title="Allocation & insights"/);
  assert.doesNotMatch(dashboard,/title="Recent paper trades"/);
});
test('new black theme and dashboard fixes are loaded after legacy blue styles',()=>{
  const main=read('src/main.tsx');
  assert.match(main,/import '\.\/paperstreet-black\.css'/);
  assert.match(main,/import '\.\/dashboard-goals-fix\.css'/);
  assert.match(main,/import '\.\/stock-page-cleanup\.css'/);
  const black=read('src/paperstreet-black.css');
  assert.match(black,/#0[Ee]0[Ee]0[Ee]/);
  assert.match(black,/--gain:/);
  assert.match(black,/--red:/);
  const layout=read('src/dashboard-goals-fix.css');
  assert.match(layout,/terminal-bottom-portfolio/);
  assert.match(layout,/terminal-goal.*terminal-muted/s);
  assert.match(layout,/goals-featured-grid/);
});
