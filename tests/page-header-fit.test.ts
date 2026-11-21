import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const main=read('src/main.tsx');
const stock=read('src/StockTerminal.tsx');
const trade=read('src/TradeTerminal.tsx');
const goals=read('src/Challenges.tsx');
const css=read('src/viewport-header-repair.css');
const dashboard=read('src/TradingDashboard.tsx');

test('viewport repair is last and does not replace the approved dark theme',()=>{
  assert.match(main,/import '\.\/unified-dark-theme\.css';\s*import '\.\/viewport-header-repair\.css';/);
  assert.match(css,/\.app-shell\.activity-theme \.global-header/);
  assert.match(css,/\.app-shell\.activity-theme \.header-market/);
  assert.match(css,/\.app-shell\.activity-theme \.header-search/);
  assert.match(css,/\.app-shell\.activity-theme \.user-copy strong/);
  assert.doesNotMatch(css,/overflow:(?:auto|scroll)/);
});

test('Markets has exactly three grid tracks for its three rendered children',()=>{
  assert.match(trade,/<h1>Markets<\/h1>/);
  assert.match(trade,/className="trade-terminal-main"/);
  assert.match(trade,/className="trade-terminal-title"/);
  assert.match(trade,/className="trade-terminal-strip"/);
  assert.match(trade,/className="trade-terminal-workspace"/);
  assert.match(css,/grid-template-rows:36px minmax\(48px,60px\) minmax\(0,1fr\)!important/);
  assert.match(css,/\.trade-terminal-workspace\{[\s\S]*?grid-row:3/);
  assert.match(css,/\.trade-terminal-workspace>\.panel/);
  assert.match(css,/\.trade-market-overview-body/);
});

test('Portfolio and Ranks headers and summary rows reserve finite height for paginated lists',()=>{
  for(const page of ['portfolio','leaderboard']){
    assert.match(css,new RegExp('\\.main-content\\[data-page="'+page+'"\\]'));
    assert.match(main,new RegExp("tab === '"+page+"'"));
  }
  assert.match(css,/\.page-insights\{[\s\S]*?grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css,/\.page-insights\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/flex:0 0 clamp\(58px,10vh,74px\)/);
  assert.match(css,/\.details-stack[\s\S]*?flex:1!important/);
  assert.match(css,/\.fit-pager/);
  assert.match(main,/label="Portfolio panels"/);
});

test('Goals title, progress, filters and paginated content fit the fixed viewport',()=>{
  for(const name of ['goals-title','goals-stats','goals-primary','goals-filterbar','goals-body'])
    assert.ok(goals.includes(name),name);
  assert.match(css,/\.goals-terminal\{[\s\S]*?grid-template-rows:36px minmax\(64px,\.7fr\) minmax\(72px,\.85fr\)/);
  assert.match(css,/\.goals-body\{[\s\S]*?min-height:0!important/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/grid-template-rows:29px minmax\(48px,11vh\) minmax\(61px,12vh\)/);
  assert.match(goals,/<FitPager/);
});

test('individual stocks have no four-option navigation strip and retain all functions',()=>{
  assert.doesNotMatch(stock,/<SectionTabs|label="Stock panels"|label:'Overview'|label:'Predict'/);
  assert.match(stock,/className="stock-terminal-header-actions"/);
  assert.match(stock,/className="stock-terminal-hero-action"/);
  assert.match(stock,/className="stock-terminal-menu-toggle" aria-expanded=\{menuOpen\}/);
  assert.match(stock,/p\.setPane\('chart'\)/);
  assert.match(stock,/p\.setPane\('order'\)/);
  assert.match(stock,/p\.setPane\('facts'\)/);
  assert.match(stock,/p\.setPane\('predict'\)/);
  for(const cls of ['stock-terminal-chart','stock-terminal-ticket','stock-terminal-metrics',
    'stock-terminal-about','stock-terminal-related','stock-terminal-activity'])
    assert.ok(stock.includes(cls),cls);
  assert.match(stock,/<StockPredictions key=\{p\.symbol\}/);
  assert.match(stock,/<PriceChart key=\{p\.symbol\+':'\+p\.range\}/);
  assert.match(stock,/<StockOrderTicket symbol=\{p\.symbol\}/);
  assert.match(css,/\.stock-terminal>\.screen-tabs\{display:none!important\}/);
  assert.match(css,/\.stock-terminal>\.stock-terminal-stage/);
  assert.match(css,/\.stock-terminal>\.stock-terminal-bottom/);
  assert.match(css,/\.stock-terminal>\.stock-terminal-rail/);
  assert.match(css,/@media\(min-width:761px\) and \(max-width:1050px\)/);
  assert.match(css,/\.stock-terminal\[data-pane="predict"\] \.stock-prediction-panel/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(main,/<StockTerminal key=\{selectedSymbol\}/);
  assert.doesNotMatch(dashboard,/StockOrderTicket|TradeOrderTicket/);
});
