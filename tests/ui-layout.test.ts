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

test('all six routes keep desktop and phone navigation',()=>{
  const pages=['dashboard','trade','portfolio','leaderboard','history','challenges'] as const;
  for (const page of pages) {
    assert.match(app,new RegExp("id: '"+page+"'"));
    assert.equal(parseAppHash(appHash(page)).view,page);
  }
  assert.match(app,/aria-label="Main navigation"/);
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
  assert.match(fit,/\.sidebar nav\{display:grid;grid-template-rows:repeat\(6,minmax\(0,1fr\)\)/);
});

test('every screen uses switches and paginated finite lists',()=>{
  for (const label of ['Dashboard panels','Trade panels','Stock panels','Portfolio panels'])
    assert.ok(app.includes(label),label);
  for (const id of ['holdings','leaders','activity','market','stocks','movers','chart','order','facts','positions','orders'])
    assert.match(fit,new RegExp('data-pane|'+id));
  assert.ok((app.match(/<FitPager/g)??[]).length>=9);
  assert.ok((challenges.match(/<FitPager/g)??[]).length>=4);
  assert.match(challenges,/Challenge sections/);
  assert.match(challenges,/const \[review,setReview\]/);
  assert.match(app,/const \[step,setStep\]=useState<0\|1\|2>\(0\)/);
  assert.match(app,/<SectionTabs label="Stock panels"/);
  assert.match(app,/<div className="chart-identity"><h1>\{selectedSymbol\}<\/h1>/);
});
