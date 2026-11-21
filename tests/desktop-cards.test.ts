import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=source('src/main.tsx');
const challenge=source('src/Challenges.tsx');
const cards=source('src/desktop-cards.css');
const fit=source('src/fit.css');

test('desktop rail fits short icon labels while phone keeps bottom navigation',()=>{
  assert.match(app,/import '\.\/fit\.css';\s*import '\.\/desktop-cards\.css';/);
  assert.match(cards,/@media \(min-width:761px\)/);
  assert.match(cards,/\.shell-body\s*\{grid-template-columns:74px minmax\(0,1fr\)!important\}/);
  assert.match(cards,/\.sidebar \.nav-button span\s*\{[^}]*font-size:10px/);
  assert.match(app,/className=\{'nav-button '/);
  assert.match(app,/<Icon size=\{22\} aria-hidden="true"\/><span>\{mobileLabel \?\? label\}<\/span>/);
  assert.match(app,/aria-label="Mobile navigation"/);
  assert.doesNotMatch(app,/className="top-nav"/);
});

test('dashboard matches trading terminal reference with simultaneous live cards',()=>{
  const dashboard=source('src/TradingDashboard.tsx');
  const theme=source('src/terminal.css');
  const tradeTheme=source('src/trade-terminal.css');
  const trade=source('src/TradeTerminal.tsx');
  assert.match(app,/import '\.\/terminal\.css';/);
  assert.match(app,/<TradingDashboard/);
  for (const area of ['terminal-summary','terminal-watch','terminal-chart-panel','terminal-lower',
    'terminal-bottom-goals','terminal-bottom-positions','terminal-bottom-activity','terminal-bottom-allocation'])
    assert.ok(dashboard.includes(area),area);
  assert.match(theme,/\.terminal-dashboard\s*\{[^}]*display:grid/);
  assert.match(theme,/\.terminal-middle\s*\{grid-template-columns/);
  assert.match(theme,/\.terminal-lower\s*\{grid-template-columns/);
  assert.match(app,/<TradeTerminal/);
  assert.match(tradeTheme,/\.trade-terminal\s*\{[^}]*display:grid/);
  assert.match(tradeTheme,/\.trade-terminal-main\s*\{[^}]*display:grid/);
  assert.match(source('src/stock-terminal.css'),/\.trade-terminal\{display:flex!important/);
  assert.ok(trade.includes('trade-market-overview'));
  assert.ok(trade.includes('trade-market-list'));
  assert.doesNotMatch(trade,/trade-market-movers|trade-market-breadth|trade-terminal-ticket/);
  assert.match(trade,/onClick=\{\(\)=>choose\(q\.symbol\)\}/);
  assert.ok((app.match(/<FitPager /g)??[]).length>=2);
  assert.ok((dashboard.match(/<FitPager /g)??[]).length>=4);
});
test('every allowed ticker uses the reference-inspired stock workspace',()=>{
  const stock=source('src/StockTerminal.tsx');
  const css=source('src/stock-terminal.css');
  assert.match(app,/tab === 'stock' \? <StockTerminal/);
  assert.match(app,/import '\.\/stock-terminal\.css'/);
  assert.match(stock,/data-pane=\{p\.pane\}/);
  for(const section of ['stock-terminal-hero','stock-terminal-quote-summary','stock-terminal-hero-facts',
    'stock-terminal-chart','stock-terminal-ticket','stock-terminal-about','stock-terminal-metrics',
    'stock-terminal-related','stock-terminal-activity'])
    assert.ok(stock.includes(section),section);
  assert.match(stock,/<StockPredictions key=\{p\.symbol\}/);
  assert.match(css,/\.stock-terminal\s*\{/);
  assert.match(css,/\.stock-terminal-stage\s*\{/);
  assert.match(css,/\.stock-terminal-rail\s*\{/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/\.stock-terminal\[data-pane="predict"\] \.stock-prediction-panel/);
  assert.doesNotMatch(app,/function DesktopTradeTicket|function TradeTicket/);
});

test('Goals follows the reference with live cards and history is below orders',()=>{
  const theme=source('src/goals-portfolio.css');
  const history=source('src/PortfolioHistory.tsx');
  const goals=source('src/Challenges.tsx');
  const forecast=source('src/StockPredictions.tsx');
  const stockCss=source('src/stock-predictions.css');
  assert.match(app,/import '\.\/goals-portfolio\.css'/);
  assert.match(app,/<PortfolioHistory trades=\{trades\}/);
  assert.match(app,/items=\{\[\{id:'positions',label:'Positions'\},\{id:'orders',label:'Queued orders'\},\{id:'history',label:'History'\}\]\}/);
  assert.match(history,/<FitPager items=\{trades\}/);
  assert.match(theme,/\.details-stack\.portfolio-stack > \.orders-panel\{/);
  assert.match(theme,/grid-area:1\/2!important/);
  assert.match(theme,/\.details-stack\.portfolio-stack > \.portfolio-history-panel\{/);
  assert.match(theme,/grid-area:2\/2/);
  for(const item of ['goals-stats','goals-primary','goals-featured','goals-completion',
    'goals-all','goals-unlocks','goals-featured-grid','goals-table-body'])
    assert.ok(goals.includes(item),item);
  assert.doesNotMatch(goals,/prediction-panel|prediction-history|submitForecast/);
  assert.match(goals,/label="Goals panels"/);
  assert.match(theme,/\.goals-body\{display:grid/);
  assert.match(theme,/\.goals-featured-grid\{display:grid/);
  assert.match(source('src/StockTerminal.tsx'),/<StockPredictions key=\{p\.symbol\}/);
  assert.match(forecast,/predictionsForStock\(predictions,symbol\)/);
  assert.match(stockCss,/@media \(min-width:761px\)/);
});

test('no-scroll viewport and mobile section controls remain intact',()=>{
  assert.match(fit,/\.app-shell\{height:100dvh;max-height:100dvh;overflow:hidden\}/);
  assert.match(fit,/\.content-wrap\s*\{[^}]*overflow:hidden!important/);
  assert.match(fit,/\.fit-pager-controls/);
  assert.match(source('src/TradingDashboard.tsx'),/label="Dashboard sections"/);
  assert.match(source('src/TradeTerminal.tsx'),/label="Trade sections"/);
  assert.doesNotMatch(source('src/StockTerminal.tsx'),/label="Stock panels"|<SectionTabs/);
  assert.match(source('src/StockTerminal.tsx'),/className="stock-terminal-menu-toggle"/);
  assert.match(source('src/StockTerminal.tsx'),/className="stock-terminal-hero-action"/);
  assert.match(app,/label="Portfolio panels"/);
  assert.match(challenge,/label="Goals panels"/);
  assert.match(cards,/\.content-wrap > \.screen-tabs,[\s\S]*?display:none!important/);
  assert.match(cards,/@media \(min-width:761px\) and \(max-height:610px\)/);
});
