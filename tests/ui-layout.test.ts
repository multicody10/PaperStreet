import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { appHash, parseAppHash } from '../src/navigation';

const read = (file:string) => readFileSync(new URL('../'+file,import.meta.url),'utf8');
const app = read('src/main.tsx');
const desktop = read('src/layout.css');
const phone = read('src/mobile.css');
const base = read('src/style.css');

test('every page has one desktop sidebar destination and a mobile bottom tab', () => {
  const pages = ['dashboard','trade','portfolio','leaderboard','history','challenges'] as const;
  for (const page of pages) {
    assert.match(app,new RegExp("id: '"+page+"'"));
    assert.equal(parseAppHash(appHash(page)).view,page);
  }
  assert.match(app,/aria-label="Main navigation"/);
  assert.match(app,/aria-label="Mobile navigation"/);
  assert.match(app,/className=\{'nav-button '/);
  assert.doesNotMatch(app,/className="top-nav"/);
  assert.doesNotMatch(app,/sidebar-promo/);
  assert.doesNotMatch(app,/className="eyebrow"/);
});

test('desktop compact navigation keeps labels under icons at all desktop widths',()=>{
  assert.match(desktop,/@media \(min-width:761px\)/);
  assert.match(desktop,/\.sidebar \.nav-button\s*\{[^}]*flex-direction:column/);
  assert.match(desktop,/\.sidebar \.nav-button span\s*\{[^}]*display:block/);
  assert.match(desktop,/\.shell-body\s*\{grid-template-columns:100px/);
  assert.match(desktop,/@media \(min-width:761px\) and \(max-width:930px\)/);
  assert.match(desktop,/\.shell-body\s*\{grid-template-columns:91px/);
  assert.match(phone,/@media \(max-width:760px\)/);
  assert.match(phone,/\.top-nav,\.sidebar\s*\{display:none\}/);
  assert.match(phone,/\.mobile-nav\s*\{[\s\S]*?display:grid/);
});

test('all page layouts provide scroll paths instead of hiding overflowing containers',()=>{
  assert.match(desktop,/\.main-content\s*\{[^}]*overflow-y:auto/);
  assert.match(desktop,/\.content-wrap\s*\{[^}]*overflow:visible/);
  for (const layout of ['overview-layout','trade-overview','stock-workspace','details-stack','challenge-layout'])
    assert.match(desktop,new RegExp('\\.'+layout+'\\s*\\{[\\s\\S]*?overflow:visible'));
  assert.match(desktop,/\.responsive-table\s*\{[^}]*overflow-x:auto/);
  assert.match(desktop,/@media \(min-width:761px\) and \(max-width:1140px\)/);
  assert.match(desktop,/@media \(min-width:761px\) and \(max-width:1020px\)/);
  assert.match(phone,/\.main-content\s*\{[^}]*overflow-x:hidden;overflow-y:auto/);
  assert.match(base,/font-family:Roboto/);
});

test('stock pages retain a clear accessible heading without duplicate page breadcrumbs',()=>{
  assert.match(app,/\{tab !== 'stock' && <div className="headline"><h1>\{title\}<\/h1><\/div>\}/);
  assert.match(app,/<div className="chart-identity"><h1>\{selectedSymbol\}<\/h1>/);
  assert.doesNotMatch(app,/PAPERSTREET EXCHANGE/);
  assert.match(app,/Virtual money only · Quotes may be delayed/);
});
