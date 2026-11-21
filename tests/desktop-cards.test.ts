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

test('dashboard and market display simultaneous paginated cards on desktop',()=>{
  assert.match(cards,/\.overview-layout\s*\{[^}]*grid-template-columns:.*?1\.1fr/);
  for (const area of ['overview-positions','overview-leaders','overview-activity','overview-pulse'])
    assert.match(app,new RegExp('className="panel '+area+'(?: |")'));
  assert.match(cards,/\.overview-layout > \.panel,[\s\S]*?display:flex!important/);
  assert.match(cards,/\.trade-overview > \.trade-universe,[\s\S]*?display:flex!important/);
  assert.match(cards,/\.trade-overview > \.trade-insights,[\s\S]*?display:grid!important/);
  assert.match(app,/className="trade-insights"/);
  assert.ok((app.match(/<FitPager /g)??[]).length>=9);
});

test('stock has chart, quote facts and full desktop ticket without mobile wizard steps',()=>{
  assert.match(cards,/\.stock-workspace\s*\{[^}]*grid-template-columns/);
  assert.match(cards,/\.stock-workspace\[data-pane\] > \.stock-research\s*\{[^}]*display:contents!important/);
  assert.match(cards,/\.stock-workspace > \.trade-panel:not\(\.trade-panel-desktop\)\s*\{[^}]*display:none!important/);
  assert.match(cards,/\.stock-workspace > \.trade-panel-desktop,[\s\S]*?display:flex!important/);
  assert.match(app,/function DesktopTradeTicket\(/);
  assert.match(app,/function TradeTicket\(/);
  for(const id of ['desktop-order-kind','desktop-trigger-price','desktop-shares'])
    assert.ok(app.includes(id));
  assert.match(cards,/@media \(max-width:760px\)\s*\{[\s\S]*?\.stock-workspace > \.trade-panel-desktop\{display:none!important\}/);
});

test('Goals keeps achievements and stock discovery while predictions move to stocks',()=>{
  assert.match(app,/portfolio-stack/);
  assert.match(cards,/\.details-stack\.portfolio-stack > \.orders-panel,[\s\S]*?display:flex!important/);
  assert.match(cards,/\.details-stack\.portfolio-stack > \.details-panel,[\s\S]*?display:flex!important/);
  for(const section of ['achievement-panel','challenge-explore'])
    assert.ok(challenge.includes('className="panel '+section+'"'),section);
  assert.doesNotMatch(challenge,/className="panel (?:prediction-panel|prediction-history)"/);
  assert.match(challenge,/className="challenge-layout fitted-panel" data-pane=\{tab\}/);
  assert.match(challenge,/label="Goals sections"/);
  const forecast=source('src/StockPredictions.tsx');
  const stockCss=source('src/stock-predictions.css');
  assert.match(app,/<StockPredictions key=\{selectedSymbol\}/);
  assert.match(forecast,/aria-label=\{'Stock predictions for '\+symbol\}/);
  assert.match(forecast,/predictionsForStock\(predictions,symbol\)/);
  assert.match(stockCss,/@media \(min-width:761px\)/);
  assert.match(stockCss,/\.stock-workspace > \.stock-prediction-panel,[\s\S]*?grid-area:3\/1/);
  assert.match(stockCss,/\.challenge-layout > \.achievement-panel,[\s\S]*?grid-area:1\/1/);
  assert.match(stockCss,/\.challenge-layout > \.challenge-explore,[\s\S]*?grid-area:1\/2/);
  assert.match(stockCss,/\.stock-workspace\[data-pane="predict"\] > \.stock-prediction-panel/);
});

test('no-scroll viewport and mobile section controls remain intact',()=>{
  assert.match(fit,/\.app-shell\{height:100dvh;max-height:100dvh;overflow:hidden\}/);
  assert.match(fit,/\.content-wrap\s*\{[^}]*overflow:hidden!important/);
  assert.match(fit,/\.fit-pager-controls/);
  assert.match(app,/label="Dashboard panels"/);
  assert.match(app,/label="Trade panels"/);
  assert.match(app,/label="Stock panels"/);
  assert.match(app,/label="Portfolio panels"/);
  assert.match(challenge,/label="Goals sections"/);
  assert.match(cards,/\.content-wrap > \.screen-tabs,[\s\S]*?display:none!important/);
  assert.match(cards,/@media \(min-width:761px\) and \(max-height:610px\)/);
});
