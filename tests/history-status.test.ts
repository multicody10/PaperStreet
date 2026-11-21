
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { classifyHistoryResponse, historyBackfillStatus, nextHistoryAttempt, reserveHistoryProviderSlot } from '../worker/history';
const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('API key setup is visible without exposing any credentials',()=>{
  assert.match(read('worker/index.ts'),/historyConfigured: Boolean\(c.env.ALPHA_VANTAGE_API_KEY\)/);
  assert.match(read('worker/index.ts'),/historyBackfillStatus\(symbol,range,c.env\)/);
  assert.match(read('src/PriceChart.tsx'),/historyBackfillMessage\(history\)/);
  assert.match(read('migrations/0011_historical_backfill_diagnostics.sql'),/next_attempt_at=0/);
});
test('provider quota, premium and invalid key errors have distinct safe outcomes',()=>{
 assert.equal(classifyHistoryResponse({Information:'The premium plan is required'}),'premium_required');
 assert.equal(classifyHistoryResponse({Note:'Our standard API rate limit is 25 requests per day'}),'rate_limited');
 assert.equal(classifyHistoryResponse({Information:'Our standard API rate limit is 25 requests per day. Visit https://alphavantage.co/premium/ for more.'}),'rate_limited');
 assert.equal(classifyHistoryResponse({Information:'Invalid API key'}),'invalid_key');
 assert.equal(classifyHistoryResponse({Information:'Please consider spreading out your free API requests more sparingly (1 request per second). You may subscribe to lift the 25 requests per day limit.'}),'burst_limited');
 assert.equal(classifyHistoryResponse({Note:'Calls exceeded request frequency per minute'}),'burst_limited');
 assert.equal(classifyHistoryResponse({'Error Message':'Unknown symbol'}),'provider_error');
 assert.equal(classifyHistoryResponse({garbage:true}),'invalid_response');
});
test('failures recover quickly; successes and rate limits respect provider budgets',()=>{
 const now=Math.floor(Date.parse('2026-11-21T15:00:00Z')/1000);
 assert.equal(nextHistoryAttempt(now,'network_error','daily'),now+600);
 assert.equal(nextHistoryAttempt(now,'burst_limited','daily'),now+15);
 assert.equal(nextHistoryAttempt(now,'invalid_response','weekly'),now+600);
 assert.equal(nextHistoryAttempt(now,'imported','daily'),now+86400);
 assert.equal(nextHistoryAttempt(now,'imported','weekly'),now+7*86400);
 assert.equal(nextHistoryAttempt(now,'rate_limited','daily'),Math.floor(now/86400)*86400+86400+60);
});
test('history API distinguishes missing credentials from unsupported 1D resolution',async()=>{
 const env={DB:{} as D1Database};
 assert.deepEqual(await historyBackfillStatus('NVDA','1D',env),{code:'intraday_only'});
 assert.deepEqual(await historyBackfillStatus('NVDA','1W',env),{code:'not_configured'});
});

test('client refreshes failed historical data at the next server retry without aggressive polling',()=>{
 const main=read('src/main.tsx');
 assert.match(main,/setHistoryRetryNonce\(n => n \+ 1\)/);
 assert.match(main,/result\.nextAttemptAt \* 1000 - Date\.now\(\) \+ 1500/);
 assert.match(main,/historyRetryNonce,/);
});

test('D1 pacing gate is shared across symbols and limits provider calls to one every three seconds',async()=>{
 const seen:unknown[][]=[];
 let next=0;
 const env={DB:{prepare(sql:string){
   assert.match(sql,/historical_provider_pacing/);
   assert.match(sql,/ON CONFLICT\(id\)/);
   assert.match(sql,/RETURNING id/);
   return {bind(...args:unknown[]){
     seen.push(args);
     return {async first(){
       const [newReady,now]=args as number[];
       if(now<next)return null;
       next=newReady;
       return {id:1};
     }};
   }};
 }} as unknown as D1Database};
 assert.equal(await reserveHistoryProviderSlot(env,100),true);
 assert.equal(await reserveHistoryProviderSlot(env,101),false);
 assert.equal(await reserveHistoryProviderSlot(env,102),false);
 assert.equal(await reserveHistoryProviderSlot(env,103),true);
 assert.deepEqual(seen,[[103,100],[104,101],[105,102],[106,103]]);
});
test('pacing is reserved before the daily API budget and old cooldowns reset',()=>{
 const code=read('worker/history.ts');
 const slot=code.indexOf('if(!await reserveHistoryProviderSlot(env,now))');
 const budget=code.indexOf("historical_backfill_budget(day,requests)");
 assert.ok(slot>=0 && budget>slot);
 const migration=read('migrations/0012_history_provider_pacing.sql');
 assert.match(migration,/CREATE TABLE IF NOT EXISTS historical_provider_pacing/);
 assert.match(migration,/last_result='rate_limited'/);
});
