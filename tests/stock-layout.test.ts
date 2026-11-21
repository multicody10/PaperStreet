import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const css=read('src/stock-page-cleanup.css');
const component=read('src/StockTerminal.tsx');
test('stock detail uses only its three currently rendered vertical tracks at desktop widths',()=>{
 assert.match(css,/@media\(min-width:1101px\)/);
 assert.match(css,/grid-template-rows:clamp\(20px,3vh,24px\) clamp\(118px,18vh,142px\) minmax\(0,1fr\)!important/);
 assert.match(css,/stock-terminal>\.stock-terminal-hero\{\s*grid-area:2\/1\/3\/2!important/);
 assert.match(css,/stock-terminal>\.stock-terminal-stage\{\s*grid-area:3\/1\/4\/2!important/);
 assert.match(css,/stock-terminal>\.stock-terminal-rail\{\s*grid-area:2\/2\/4\/3!important/);
 assert.doesNotMatch(component,/stock-terminal-bottom|stock-terminal-about|stock-terminal-metrics/);
});
test('header title and quote summary are independently sized, not overlapped',()=>{
 assert.match(css,/stock-terminal>\.stock-terminal-hero\{\s*display:grid!important/);
 assert.match(css,/grid-template-rows:minmax\(40px,auto\) minmax\(0,1fr\)/);
 assert.match(css,/stock-terminal-hero-title\{\s*display:grid!important/);
 assert.match(css,/stock-terminal-quote-summary\{\s*display:grid!important/);
 assert.match(component,/className="stock-terminal-snapshot"/);
 assert.match(component,/className="stock-terminal-snapshot-range"/);
 assert.match(read('src/paperstreet-black.css'),/\.stock-terminal-snapshot\{/);
 assert.match(css,/stock-terminal-name-row h1\{[\s\S]*?text-overflow:ellipsis/);
 assert.match(component,/className="stock-terminal-hero-title"/);
 assert.match(component,/className="stock-terminal-quote-summary"/);
});
test('intermediate desktop and mobile keep chart, ticket, and predictions accessible',()=>{
 assert.match(css,/@media\(min-width:761px\) and \(max-width:1100px\)/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/\[data-pane="chart"\] \.stock-terminal-chart/);
 assert.match(css,/\[data-pane="order"\] \.stock-terminal-ticket/);
 assert.match(css,/\[data-pane="predict"\] \.stock-prediction-panel/);
 assert.match(css,/@media\(min-width:761px\) and \(max-height:535px\)/);
 assert.match(css,/grid-template-rows:19px 82px minmax\(0,1fr\)!important/);
 assert.match(component,/p\.setPane\('order'\)/);
 assert.match(component,/p\.setPane\('predict'\)/);
});
