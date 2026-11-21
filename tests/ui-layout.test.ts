import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { appHash, parseAppHash } from '../src/navigation';

const read=(file:string)=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const app=read('src/main.tsx');
const layout=read('src/layout.css');
const fit=read('src/fit.css');
const mobile=read('src/mobile.css');
const base=read('src/style.css');
const challenges=read('src/Challenges.tsx');
const dashboard=read('src/TradingDashboard.tsx');
const theme=read('src/terminal.css');
const trade=read('src/TradeTerminal.tsx');
const tradeTheme=read('src/trade-terminal.css');
const goalsTheme=read('src/goals-portfolio.css');

test('five navigation pages keep desktop and phone navigation',()=>{
  const pages=['dashboard','trade','portfolio','leaderboard','challenges'] as const;
  for (const page of pages) {
    assert.match(app,new RegExp("id: '"+page+"'"));
    assert.equal(parseAppHash(appHash(page)).view,page);
  }
  assert.match(app,/aria-label="Main navigation"/);
  assert.doesNotMatch(app, /id: 'history', label:/);
  assert.equal(parseAppHash('#/history').view,'portfolio');
  assert.match(app,/aria-label="Mobile navigation"/);
  assert.match(layout,/\.sidebar \.nav-button\s*\{[^}]*flex-direction:column/);
  assert.match(mobile,/@media \(max-width:760px\)/);
  assert.match(base,/font-family:Roboto/);
  assert.doesNotMatch(app,/className="top-nav"|sidebar-promo|PAPERSTREET EXCHANGE/);
});

test('screen-fit stylesheet owns viewport sizing and disables scrolling',()=>{
  assert.match(app,/import '\.\/fit\.css';/);
  assert.match(fit,/\.app-shell\{height:100dvh;max-height:100dvh;overflow:hidden\}/);
  assert.match(fit,/\.main-content\{height:100%\}/);
  assert.match(fit,/\.content-wrap\s*\{[^}]*overflow:hidden!important/);
  assert.match(fit,/\.fit-pager-viewport\s*\{[^}]*overflow:hidden/);
  assert.match(fit,/\.fit-pager-controls/);
  assert.match(fit,/\*::-webkit-scrollbar\{display:none!important\}/);
  assert.match(fit,/@media\(max-width:760px\)/);
  assert.match(fit,/@media\(max-width:760px\) and \(max-height:560px\)/);
  assert.match(goalsTheme,/\.sidebar nav\s*\{\s*display:flex!important/);
});

test('every screen uses switches and paginated finite lists',()=>{
  for (const label of ['Stock panels','Portfolio panels'])
    assert.ok(app.includes(label),label);
  assert.match(dashboard,/label="Dashboard sections"/);
  assert.match(trade,/label="Trade sections"/);
  assert.match(tradeTheme,/@media\(max-width:760px\)/);
  assert.match(theme,/\.terminal-dashboard/);
  for (const id of ['holdings','leaders','activity','market','stocks','movers','chart','order','facts','positions','orders'])
    assert.match(fit,new RegExp('data-pane|'+id));
  assert.ok((app.match(/<FitPager/g)??[]).length>=2);
  assert.ok((trade.match(/<FitPager/g)??[]).length>=2);
  assert.ok((dashboard.match(/<FitPager/g)??[]).length>=4);
  assert.ok((challenges.match(/<FitPager/g)??[]).length>=1);
  assert.match(challenges,/Goals panels/);
  assert.match(challenges,/Goal categories/);
  assert.doesNotMatch(challenges,/const \[review,setReview\]|prediction-panel|prediction-history/);
  assert.match(app,/const \[step,setStep\]=useState<0\|1\|2>\(0\)/);
  assert.match(app,/<SectionTabs label="Stock panels"/);
  assert.match(app,/\{id:\x27predict\x27,label:\x27Predict\x27\}/);
  assert.match(app,/import \{ StockPredictions \} from \x27\.\/StockPredictions\x27/);
  assert.match(app,/<div className="chart-identity"><h1>\{selectedSymbol\}<\/h1>/);
});
