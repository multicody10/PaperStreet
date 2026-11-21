import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const main=read('src/main.tsx');
const dashboard=read('src/TradingDashboard.tsx');
const css=read('src/dashboard-reference.css');
const oldViewport=read('src/viewport-fit.css');
const stock=read('src/StockTerminal.tsx');

test('the signed-in dashboard renders the reference-inspired trading overview by default',()=>{
  assert.match(main,/const overview = !account && \(tab === 'dashboard' \|\| tab === 'trade'\)/);
  assert.match(main,/tab === 'dashboard' \? <TradingDashboard/);
  assert.match(main,/import '\.\/viewport-fit\.css';\s*import '\.\/dashboard-reference\.css';/);
  assert.match(dashboard,/className="terminal-dashboard reference-dashboard"/);
  assert.match(dashboard,/terminal-summary/);
  assert.match(dashboard,/terminal-middle/);
  assert.match(dashboard,/terminal-lower/);
});

test('portfolio, goal and activity use actual data without inventing streaks or performance',()=>{
  assert.match(dashboard,/const equity=p\.portfolio\?\.equityCents\?\?initial/);
  assert.match(dashboard,/const goal=Math\.round\(initial\*1\.1\)/);
  assert.match(dashboard,/p\.trades\.length/);
  assert.match(dashboard,/openPositions\.length/);
  assert.match(dashboard,/p\.history\?\.candles/);
  assert.match(dashboard,/not portfolio performance/);
  assert.doesNotMatch(dashboard,/Trading Streak|Math\.random|fake|simulated/i);
});

test('the chart dominates the middle row and no buy or sell ticket appears on the dashboard',()=>{
  assert.match(dashboard,/className="terminal-watch"/);
  assert.match(dashboard,/className="panel terminal-chart-panel"/);
  assert.match(dashboard,/<PriceChart key=\{p\.selectedSymbol\+':'\+p\.range\}/);
  assert.match(css,/\.reference-dashboard \.terminal-middle\{\s*grid-template-columns:minmax\(250px,\.86fr\) minmax\(0,2\.43fr\)!important/);
  assert.doesNotMatch(dashboard,/StockOrderTicket|TradeOrderTicket|terminal-order|Buy\/Sell|Submit Buy Order|execute-button/);
  assert.match(stock,/function StockOrderTicket/);
});

test('all screenshot data panels remain real and accessible including phone tabs',()=>{
  for(const cls of ['terminal-equity','terminal-goal','terminal-activity-stat','terminal-watch',
    'terminal-chart-panel','terminal-bottom-goals','terminal-bottom-positions','terminal-bottom-activity',
    'terminal-bottom-allocation','terminal-donut'])
    assert.ok(dashboard.includes(cls),cls);
  assert.equal((dashboard.match(/<FitPager/g)||[]).length,4);
  for(const section of ["'market'","'chart'","'positions'","'activity'","'goals'","'insights'"])
    assert.ok(dashboard.includes(section),'missing mobile section '+section);
  assert.match(css,/terminal-lower\[data-section="goals"\]/);
  assert.match(css,/terminal-lower\[data-section="insights"\]/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/@media\(min-width:1400px\) and \(max-width:1700px\)/);
  assert.match(oldViewport,/overflow:hidden!important/);
  assert.doesNotMatch(css,/overflow:(?:scroll|auto)/);
});

test('navy and cyan redesign is isolated to dashboard, not applied to all other pages',()=>{
  assert.match(css,/:has\(\.reference-dashboard\)/);
  assert.match(css,/--dashboard-bg:#080e18/);
  assert.match(css,/--dashboard-card:#111927/);
  assert.match(css,/--dashboard-cyan:#1abef4/);
  assert.match(css,/--dashboard-gain:#31d98e/);
  assert.match(css,/border:1px solid var\(--dashboard-line\)!important/);
  assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
  assert.match(css,/max-height:689px/);
});
