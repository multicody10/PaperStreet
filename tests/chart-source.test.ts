import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {chartDataStatus,PriceChart} from '../src/PriceChart';
import type {ChartHistory,Quote} from '../shared/stocks';

const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const quote:Quote={symbol:'NVDA',name:'NVIDIA',priceCents:12533,previousCloseCents:12421,
  fetchedAt:1795273200,changePct:.9,source:'finnhub',stale:false,marketOpen:false,
  sessionBar:{openCents:12345,highCents:12600,lowCents:12300,closeCents:12533}};
const sample:ChartHistory={bucketSeconds:86400,candles:[
 {firstAt:1795000000,lastAt:1795000000,samples:2,
  openCents:12000,highCents:12600,lowCents:11900,closeCents:12500}]};

test('chart displays collected Finnhub observations without an external history provider',()=>{
 const html=renderToStaticMarkup(createElement(PriceChart,{history:sample,quote,range:'1M'}));
 assert.match(html,/Finnhub observations · 1 candle/);
 assert.match(html,/chart-data-status/);
 assert.match(html,/candle-plot/);
 assert.doesNotMatch(html,/Vantage|backfill|rate.limit/i);
});
test('charts remain usable when no earlier market observations exist',()=>{
 const html=renderToStaticMarkup(createElement(PriceChart,{
   history:{candles:[],bucketSeconds:86400},quote,range:'1M',
 }));
 assert.match(html,/Latest session candle/);
 assert.match(html,/No prices recorded for this period yet/);
 assert.equal(chartDataStatus(undefined,'ALL').text,'Loading recorded prices…');
 assert.equal(chartDataStatus({candles:[],bucketSeconds:86400},'1D').text,'No intraday prices recorded yet');
 assert.equal(chartDataStatus(undefined,'1M','failed').warning,true);
});
test('legacy source modules no longer request or expose third-party historical data',()=>{
 for(const path of ['worker/index.ts','worker/market.ts','shared/stocks.ts','src/PriceChart.tsx','src/main.tsx']){
  const src=read(path);
  assert.doesNotMatch(src,/ALPHA_VANTAGE|alphavantage|backfillHistoricalBars|historyBackfillStatus/);
 }
 const route=read('worker/index.ts');
 assert.match(route,/const history = await quoteHistory\(symbol, c\.env, range\)/);
 assert.match(route,/source: 'finnhub'/);
 assert.doesNotMatch(route,/historyConfigured|backfill,/);
 assert.match(read('src/main.tsx'),/import '\.\/chart-status\.css'/);
 assert.match(read('src/chart-status.css'),/chart-data-status/);
});
