import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { historyResolution, parseHistoricalSeries, sessionCloseAt } from '../worker/history';
const at=(iso:string)=>Math.floor(Date.parse(iso)/1000);
const raw=(o='100',h='111',l='95',c='105')=>({
 '1. open':o,'2. high':h,'3. low':l,'4. close':c,'5. volume':'1000',
});
test('history backfill is provider OHLC only, never used as a trading quote',()=>{
 const src=readFileSync(new URL('../worker/history.ts',import.meta.url),'utf8');
 const schema=readFileSync(new URL('../migrations/0010_historical_backfill.sql',import.meta.url),'utf8');
 assert.match(src,/TIME_SERIES_DAILY/);
 assert.match(src,/TIME_SERIES_WEEKLY/);
 assert.match(src,/BUDGET=20/);
 assert.match(src,/historical_backfill_budget/);
 assert.match(schema,/CREATE TABLE IF NOT EXISTS historical_ohlc/);
 assert.doesNotMatch(src,/INSERT INTO quote_cache|INSERT INTO quote_history|INSERT INTO trades/);
 assert.equal(historyResolution('1D'),null);
 assert.equal(historyResolution('1W'),'daily');
 assert.equal(historyResolution('3M'),'daily');
 assert.equal(historyResolution('1Y'),'weekly');
 assert.equal(historyResolution('ALL'),'weekly');
});
test('historical provider dates resolve to actual NYSE close across DST/holidays',()=>{
 assert.equal(sessionCloseAt('2026-11-20'),at('2026-11-20T21:00:00Z'));
 assert.equal(sessionCloseAt('2026-07-07'),at('2026-07-07T20:00:00Z'));
 assert.equal(sessionCloseAt('2026-11-27'),at('2026-11-27T18:00:00Z'));
 for(const date of ['2026-11-26','2026-11-21','2026-02-30'])
  assert.equal(sessionCloseAt(date),null);
});
test('historical OHLC accepts only valid completed market days and finite prices',()=>{
 const now=at('2026-11-28T15:00:00Z');
 const data={'Time Series (Daily)':{
  '2026-11-20':raw('100','111','95','105'),
  '2026-11-27':raw('100','107','99','104'),
  '2026-11-26':raw(), // Thanksgiving
  '2026-11-23':raw('100','95','99','105'), // invalid high
  '2026-11-24':raw('0','111','95','105'),
  '2026-11-30':raw(), // future
 }};
 const bars=parseHistoricalSeries(data,'daily',now);
 assert.deepEqual(bars.map(b=>b.date),['2026-11-20','2026-11-27']);
 assert.deepEqual(bars.map(b=>b.closeCents),[10500,10400]);
 assert.deepEqual(parseHistoricalSeries({Information:'Rate limit'},'daily',now),[]);
 assert.equal(parseHistoricalSeries({'Weekly Time Series':{'2026-11-20':raw()}},'weekly',now).length,1);
 assert.equal(parseHistoricalSeries({'Time Series (Daily)':{'2026-11-20':{'1. open':'wrong'}}},'daily',now).length,0);
});

test('long-lived symbols retain recent decades instead of losing all historical bars',()=>{
 const now=at('2026-11-28T15:00:00Z');
 const series:Record<string,ReturnType<typeof raw>>={};
 for(let year=1960;year<=2026;year++)
   for(let month=1;month<=12;month++){
     const date=new Date(Date.UTC(year,month-1,15));
     while(date.getUTCDay()!==5)date.setUTCDate(date.getUTCDate()+1);
     const day=date.toISOString().slice(0,10);
     series[day]=raw();
   }
 const bars=parseHistoricalSeries({'Weekly Time Series':series},'weekly',now);
 assert.ok(bars.length>250);
 assert.ok(bars.every(bar=>bar.date>='1996-11-01'));
 assert.ok(bars.every(bar=>bar.at<now));
});
