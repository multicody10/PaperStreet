import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=read('src/flat-terminal.css');
const main=read('src/main.tsx');
const dashboard=read('src/TradingDashboard.tsx');
const market=read('src/TradeTerminal.tsx');
const stock=read('src/StockTerminal.tsx');
const goals=read('src/Challenges.tsx');
const portfolio=read('src/PortfolioHistory.tsx');
const fit=read('src/fit.css');

test('the last stylesheet uses neutral black and white with selective market accents',()=>{
  assert.match(main,/import '\.\/stock-terminal\.css';\s*import '\.\/flat-terminal\.css';/);
  for(const color of ['--bg:#070707','--surface:#121212','--surface-up:#1b1b1b',
    '--card-edge:#383838','--cyan:#d2d2d2','--gain:#27d078'])
    assert.ok(css.includes(color),color);
  assert.match(css,/background:#070707!important/);
  assert.match(css,/background:#121212!important/);
  assert.match(css,/border-color:#373737!important/);
  assert.match(css,/\.app-shell \.sidebar \.nav-button\.active/);
  assert.match(css,/box-shadow:inset 3px 0 #28c777!important/);
  assert.match(css,/\.app-shell \.execute-button\.sell/);
  assert.match(css,/\.goals-progress-track i/);
  assert.doesNotMatch(css,/#17bfff|#21c4f6|#0e678e/);
  assert.match(goals,/conic-gradient\(#28d77b/);
});

test('Trade prioritizes the chart and places the stock list in a right rail',()=>{
  assert.match(market,/className="trade-terminal-workspace"/);
  const overview=market.indexOf('className="panel trade-market-overview"');
  const stocks=market.indexOf('className="panel trade-market-list"');
  assert.ok(overview>=0&&stocks>overview);
  assert.match(css,/\.trade-terminal-workspace\{\s*display:grid;grid-template-columns:minmax\(0,2\.5fr\) minmax\(330px,1fr\)/);
  assert.match(css,/grid-template-columns:minmax\(0,2\.72fr\) minmax\(350px,1fr\)/);
  assert.match(css,/\.trade-terminal-main\{\s*grid-template-rows:34px 62px minmax\(0,1fr\)!important/);
  assert.match(css,/\.trade-market-overview-body\{\s*display:flex!important;flex-direction:column/);
  assert.match(css,/\.trade-market-table-symbol-details small/);
  assert.match(market,/trade-market-table-symbol-details/);
  assert.match(css,/@media\(max-width:760px\)\{[\s\S]*?\.trade-terminal-workspace\{display:contents!important\}/);
  assert.match(css,/@media\(min-width:761px\) and \(max-width:1100px\)/);
});

test('full stock name stays readable and the trade CTA cannot steal its width',()=>{
  assert.match(stock,/<h1 title=\{profile\.companyName\}>\{profile\.companyName\}<\/h1>/);
  assert.match(stock,/className="stock-terminal-name-row"/);
  assert.match(stock,/className="stock-terminal-symbol"/);
  assert.match(css,/\.stock-terminal-hero-title\{\s*display:grid!important;grid-template-columns:auto minmax\(0,1fr\) auto/);
  assert.match(css,/\.stock-terminal-name-row h1\{[\s\S]*?text-overflow:ellipsis/);
  assert.match(css,/@media\(max-width:760px\)\{[\s\S]*?\.stock-terminal-name-row h1/);
});

test('every supported page has a viewport-specific 1544x768 desktop composition',()=>{
  assert.match(main,/<main className="main-content" data-page=\{tab\}>/);
  assert.match(css,/1544 × 768 reference viewport/);
  assert.match(css,/@media\(min-width:1400px\) and \(max-width:1700px\) and \(min-height:690px\) and \(max-height:850px\)/);
  assert.match(css,/\.app-shell\{grid-template-rows:62px minmax\(0,1fr\)!important\}/);
  assert.match(css,/\.shell-body\{grid-template-columns:74px minmax\(0,1fr\)!important\}/);
  assert.match(css,/\.terminal-dashboard\s*\{\s*grid-template-rows:minmax\(90px,\.68fr\) minmax\(0,2\.24fr\) minmax\(0,1\.45fr\)!important/);
  assert.match(css,/\.terminal-summary\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important\}/);
  assert.match(css,/\.terminal-lower\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important\}/);
  assert.match(css,/\.trade-terminal-main\s*\{[^}]*grid-template-rows:34px 62px/);
  assert.match(css,/\.stock-terminal\s*\{[^}]*grid-template-rows:23px 113px 32px/);
  assert.match(css,/\.goals-terminal\s*\{[^}]*grid-template-rows:40px 90px 95px 33px/);
  assert.match(css,/\.details-stack\.portfolio-stack\s*\{[^}]*grid-template-columns:minmax\(0,1\.7fr\)/);
  assert.match(css,/\.main-content\[data-page="leaderboard"\] \.details-stack/);
  assert.match(fit,/\.app-shell\{height:100dvh;max-height:100dvh;overflow:hidden\}/);
});

test('Portfolio and Leaderboard have compact live-data summary cards, not fake numbers',()=>{
  assert.match(main,/className=\{'page-insights '/);
  assert.match(main,/Account equity/);
  assert.match(main,/portfolio\.equityCents/);
  assert.match(main,/portfolio\.cashCents/);
  assert.match(main,/portfolio\.investedCents/);
  assert.match(main,/portfolio\.profitCents/);
  assert.match(main,/Ranked traders/);
  assert.match(main,/Leading equity/);
  assert.match(main,/leaders\[0\]\.equityCents/);
  assert.match(main,/leaders\.findIndex/);
  assert.match(portfolio,/className="panel portfolio-history-panel"/);
  assert.match(css,/\.page-insights\{[^}]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css,/\.page-insights\.leaderboard-insights\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/);
  assert.match(css,/\.page-insight>strong\{/);
});

test('all existing real-data routes retain their interactive panels',()=>{
  assert.match(main,/<TradingDashboard/);
  assert.match(main,/<TradeTerminal/);
  assert.match(main,/<StockTerminal/);
  assert.match(main,/<Challenges achievements=\{achievements\} portfolio=\{portfolio\}/);
  assert.match(dashboard,/terminal-middle/);
  assert.match(dashboard,/terminal-lower/);
  assert.match(market,/trade-market-overview/);
  assert.match(market,/trade-market-list/);
  assert.doesNotMatch(market,/trade-market-movers|trade-market-breadth|TradeOrderTicket/);
  assert.match(stock,/stock-terminal-stage/);
  assert.match(stock,/StockOrderTicket/);
  assert.match(stock,/StockPredictions/);
  assert.match(goals,/goals-featured-grid/);
  assert.match(goals,/goals-completion-ring/);
});

test('short desktops, narrow desktops, and phones retain no-scroll responsive behavior',()=>{
  assert.match(css,/@media\(min-width:761px\) and \(max-width:1199px\)/);
  assert.match(css,/@media\(min-width:761px\) and \(max-height:689px\)/);
  assert.match(css,/@media\(min-width:761px\) and \(max-height:535px\)/);
  assert.match(css,/@media\(min-width:761px\) and \(max-width:1050px\)/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/\.page-insights\{display:none\}/);
  assert.match(css,/\.stock-terminal\[data-pane="predict"\]>\.stock-terminal-rail\{display:flex/);
  assert.match(css,/\.main-content\{min-width:0;min-height:0;overflow:hidden!important\}/);
  assert.match(css,/\.content-wrap\s*\{[^}]*overflow:hidden!important/);
  assert.match(fit,/\.fit-pager-viewport\s*\{[^}]*overflow:hidden/);
});
