import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('src/main.tsx');
const theme=read('src/unified-dark-theme.css');
const dashboard=read('src/TradingDashboard.tsx');
const stock=read('src/StockTerminal.tsx');

test('the dark Dashboard visual system is the final stylesheet on every route',()=>{
  assert.match(app,/import '\.\/viewport-fit\.css';\s*import '\.\/dashboard-reference\.css';\s*import '\.\/unified-dark-theme\.css';/);
  assert.match(app,/id: 'dashboard', label: 'Dashboard', mobileLabel: 'Home'/);
  for(const route of ['dashboard','trade','portfolio','leaderboard','challenges'])
    assert.match(app,new RegExp("id: '"+route+"'"));
  assert.match(app,/<StockTerminal/);
  assert.match(app,/<TradeTerminal/);
  assert.match(app,/<Challenges achievements=\{achievements\}/);
});

test('navy-black palette uses the same surface and typography tokens across pages',()=>{
  for(const token of [
    '--paper-bg:#070b12','--paper-card:#101724','--paper-card-deep:#0d1522',
    '--paper-header:#111b2a','--paper-border:#344258','--paper-accent:#1ab8ec',
    '--gain:#30d68b','--red:#f07181','color-scheme:dark'
  ])assert.ok(theme.includes(token),token);
  assert.match(theme,/background:var\(--paper-bg\)!important/);
  assert.match(theme,/background:#090f19!important/);
  assert.match(theme,/color:#f1f6fd!important/);
  assert.doesNotMatch(theme,/#c4f66a|#17bfff|#070707|background:#fff(?:fff)?/i);
});

test('visible one-pixel outlines apply to the parent cards of every real page',()=>{
  for(const card of [
    '.terminal-summary-card','.terminal-card','.terminal-chart-panel',
    '.trade-terminal-snapshot','.goals-stat','.goals-primary','.goals-feature',
    '.stock-terminal-hero','.stock-terminal-quote-summary','.overview-panel',
    '.balance-card','.page-insight','.details-panel','.orders-panel',
    '.portfolio-history-panel','.welcome-panel'
  ])assert.ok(theme.includes(card),card);
  assert.match(theme,/border:1px solid var\(--paper-border\)!important/);
  assert.match(theme,/border-radius:11px!important/);
  assert.match(theme,/border-color:var\(--paper-border-hover\)!important/);
  assert.match(theme,/box-shadow:inset 0 1px 0 #ffffff04!important/);
});

test('all routes have the Dashboard navigation, chart, controls, indicators and panels',()=>{
  for(const selector of [
    '.global-header','.sidebar','.mobile-nav','.header-search','.header-ticker',
    '.panel-heading','.trade-market-overview-head','.trade-market-list-bar',
    '.stock-terminal-heading','.goals-panel-heading','.portfolio-history-head',
    '.trade-market-table-head','.responsive-table th','.goals-table-head',
    '.fit-pager-controls','.chart-range-bar button.active','.goals-progress-track',
    '.goals-completion-ring','.overview-screen','.reference-dashboard'
  ])assert.ok(theme.includes(selector),selector);
  assert.match(theme,/@media\(min-width:761px\) and \(max-width:1199px\)/);
  assert.match(theme,/@media\(max-width:760px\)/);
  assert.match(theme,/box-shadow:inset 3px 0 #1ab8ec!important/);
  assert.match(theme,/background:#10344c!important/);
  assert.match(theme,/\.execute-button\.buy/);
  assert.match(theme,/\.execute-button\.sell/);
});

test('trading remains on stock pages and fixed viewport pagination is not disturbed',()=>{
  assert.doesNotMatch(dashboard,/TradeOrderTicket|StockOrderTicket|terminal-order|execute-button/);
  assert.match(stock,/StockOrderTicket/);
  assert.match(app,/tab === 'dashboard' \? <TradingDashboard/);
  assert.match(app,/tab === 'stock' \? <StockTerminal/);
  assert.match(app,/request<\{ fillPriceCents\?: number; duplicate\?: boolean \}>\('\/api\/trade'/);
  assert.doesNotMatch(theme,/overflow:(?:auto|scroll)/);
  assert.doesNotMatch(theme,/\.trade-terminal-workspace\s*\{[^}]*grid-template-columns/);
  assert.doesNotMatch(theme,/\.reference-dashboard\s*\{[^}]*grid-template-rows/);
});
