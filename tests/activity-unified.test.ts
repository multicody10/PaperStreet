import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const main=read('src/main.tsx');
const css=read('src/activity-unified.css');
const overview=read('src/Overview.tsx');
const panels=read('src/OverviewPanels.tsx');
const trade=read('src/TradeTerminal.tsx');
const stock=read('src/StockTerminal.tsx');

test('the restored Overview remains available to guests; signed-in users see the chart dashboard',()=>{
  assert.match(main,/import '\.\/overview\.css';\s*import '\.\/activity-shell\.css';\s*import '\.\/activity-unified\.css';/);
  assert.match(main,/className="app-shell activity-theme"/);
  assert.match(main,/<Overview key=\{tab\}/);
  assert.match(main,/brandMark/);
  assert.match(main,/const overview = !account && \(tab === 'dashboard' \|\| tab === 'trade'\)/);
  assert.match(main,/onAnalytics=\{\(\)=>goToPage\('dashboard'\)\}/);
  assert.doesNotMatch(main,/setAnalytics|className="analytics-return"/);
  assert.match(main,/tab === 'dashboard' \? <TradingDashboard/);
  assert.match(overview,/MarketList/);
  assert.match(panels,/const stocks = STOCKS\.map/);
  assert.match(panels,/quotes\.find\(q => q\.symbol === symbol\)/);
});

test('Trading and real-data views are preserved across all routes',()=>{
  for(const route of ['dashboard','trade','portfolio','leaderboard','challenges'])
    assert.match(main,new RegExp("id: '"+route+"'"));
  assert.match(main,/tab === 'trade' \? <TradeTerminal/);
  assert.match(main,/tab === 'stock' \? <StockTerminal/);
  assert.match(main,/tab === 'challenges' \? <Challenges/);
  assert.match(main,/className=\{tab === 'portfolio' \? 'details-stack portfolio-stack'/);
  assert.match(main,/request\('\/api\/orders'/);
  assert.match(main,/request<\{ fillPriceCents\?: number; duplicate\?: boolean \}>\('\/api\/trade'/);
  assert.match(trade,/<PriceChart key=\{p\.selectedSymbol\+':'\+p\.range\}/);
  assert.match(stock,/<StockPredictions key=\{p\.symbol\}/);
  assert.doesNotMatch(trade,/TradeOrderTicket|Place paper order|Market breadth/);
});

test('final layer is neutral and uses chart-first layouts on desktop',()=>{
  for(const name of ['.app-shell.activity-theme','.goals-stat','.stock-terminal-hero',
    '.trade-terminal-workspace','.page-insights','.overview-screen','.mobile-nav','.analytics-return'])
    assert.ok(css.includes(name),name);
  assert.match(css,/--bg:#0b0c0d/);
  assert.match(css,/--gain:#30ce7b/);
  assert.match(css,/background:#17191b!important/);
  assert.match(css,/border:1px solid #35393b!important/);
  assert.match(css,/grid-template-columns:minmax\(0,2\.72fr\) minmax\(350px,1fr\)/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/@media\(min-width:1400px\) and \(max-width:1700px\)/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.doesNotMatch(css,/#c4f66a|#17bfff|linear-gradient\(145deg/);
});
