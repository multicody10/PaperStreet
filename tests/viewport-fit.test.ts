import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { pageCapacity } from '../src/FitPager';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const main = read('src/main.tsx');
const overview = read('src/Overview.tsx');
const panels = read('src/OverviewPanels.tsx');
const viewport = read('src/viewport-fit.css');
const legacyFit = read('src/fit.css');

test('the last stylesheet constrains all routed pages to the Discord viewport', () => {
  assert.match(main, /import '\.\/activity-unified\.css';\s*import '\.\/viewport-fit\.css';/);
  assert.match(legacyFit, /\.app-shell\{height:100dvh;max-height:100dvh;overflow:hidden\}/);
  for (const selector of ['.shell-body', '.main-content', '.content-wrap', '.overview-screen',
    '.terminal-dashboard', '.trade-terminal', '.stock-terminal', '.goals-terminal', '.details-stack'])
    assert.ok(viewport.includes(selector), 'unbounded view: ' + selector);
  assert.match(viewport, /\.app-shell\.activity-theme \.overview-screen\{[\s\S]*?overflow:hidden!important/);
  assert.doesNotMatch(viewport, /overflow:(?:auto|scroll)/);
});

test('Overview partitions its contents into finite sections rather than a vertical feed', () => {
  for (const section of ["'summary'", "'markets'", "'account'", "'activity'"])
    assert.ok(overview.includes(section), 'missing section ' + section);
  assert.match(overview, /<SectionTabs items=\{sections\}/);
  assert.match(overview, /overview-focus/);
  assert.match(overview, /overview-summary-layout/);
  assert.match(overview, /overview-pane-grid/);
  assert.match(overview, /overview-mobile-subtabs/);
  assert.match(overview, /data-mobile-panel=\{detail\}/);
  assert.doesNotMatch(overview, /overflow:auto|overflow:scroll/);
});

test('market, positions, rankings, trade history and movers paginate to measured height', () => {
  assert.equal((panels.match(/<FitPager/g) ?? []).length, 5);
  assert.match(panels, /key=\{filter \+ ':' \+ term \+ ':' \+ String\(!!onAll\)\}/);
  for (const component of ['MarketList', 'Holdings', 'Rankings', 'OrderList', 'MarketPulse'])
    assert.ok(panels.includes('export function ' + component), component);
  assert.equal(pageCapacity(330, 57), 5);
  assert.equal(pageCapacity(114, 57), 2);
  assert.equal(pageCapacity(40, 57), 1);
});

test('narrow desktop and phone use reachable panels rather than clipping hidden content', () => {
  assert.match(viewport, /@media\(min-width:761px\) and \(max-width:1100px\)/);
  assert.match(viewport, /\.trade-terminal>\.screen-tabs/);
  assert.match(viewport, /trade-terminal\[data-section="overview"\] \.trade-market-list/);
  assert.match(viewport, /trade-terminal\[data-section="stocks"\] \.trade-market-overview/);
  assert.match(viewport, /@media\(max-width:1000px\)/);
  assert.match(viewport, /overview-focus\[data-mobile-panel="first"\]/);
  assert.match(viewport, /overview-focus\[data-mobile-panel="second"\]/);
  assert.match(viewport, /@media\(max-width:760px\)/);
  assert.match(viewport, /@media\(max-height:560px\)/);
  assert.match(viewport, /@media\(max-height:420px\)/);
});
