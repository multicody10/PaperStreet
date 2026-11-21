import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import type { ChartHistory, Quote } from '../shared/stocks';
import { chartDataStatus, PriceChart } from '../src/PriceChart';
const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const quote:Quote={symbol:'NVDA',name:'NVIDIA',priceCents:12533,previousCloseCents:12421,
 fetchedAt:1795273200,changePct:0.9,source:'finnhub',stale:false,marketOpen:false,
 sessionBar:{openCents:12345,highCents:12600,lowCents:12300,closeCents:12533}};
const fallback:ChartHistory={bucketSeconds:86400,candles:[],backfill:{code:'invalid_key'}};
const imported:ChartHistory={bucketSeconds:86400,source:'alphavantage',resolution:'daily',
 candles:[{firstAt:1795000000,lastAt:1795000000,samples:1,
 openCents:12000,highCents:12600,lowCents:11900,closeCents:12500}]};

test('chart shows provider errors outside its responsive-hidden heading',()=>{
 const html=renderToStaticMarkup(createElement(PriceChart,{history:fallback,quote,range:'1M'}));
 assert.match(html,/class="chart-data-status warning"/);
 assert.match(html,/History provider rejected API key/);
 assert.match(html,/role="status"/);
 assert.match(read('src/history-status.css'),/\.chart-data-status\s*\{/);
});
test('successful history shows provider and count without depending on heading',()=>{
 const html=renderToStaticMarkup(createElement(PriceChart,{history:imported,quote,range:'1M'}));
 assert.match(html,/Alpha Vantage history · 1 daily bars/);
 assert.match(html,/class="chart-data-status"/);
 assert.match(html,/candle-plot/);
 assert.equal(chartDataStatus(imported,'1M').warning,false);
});
test('loading, intraday, missing keys, and request failures have visible states',()=>{
 assert.equal(chartDataStatus(undefined,'1M').text,'Loading price history…');
 assert.match(chartDataStatus({bucketSeconds:900,candles:[]},'1D').text,/no backfill/);
 assert.equal(chartDataStatus({bucketSeconds:86400,candles:[],
  backfill:{code:'not_configured'}},'1M').text,'Historical data key not configured');
 assert.equal(chartDataStatus(undefined,'ALL','500').text,'Price history request failed');
});
test('history data status remains separate from headings hidden at small heights',()=>{
 for (const path of ['src/terminal.css','src/stock-terminal.css','src/dashboard-reference.css','src/trade-terminal.css'])
  assert.doesNotMatch(read(path),/\.chart-data-status\s*\{\s*display\s*:\s*none/i);
 assert.match(read('src/PriceChart.tsx'),/className=\{'chart-data-status'/);
});
