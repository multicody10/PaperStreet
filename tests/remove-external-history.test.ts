import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync} from 'node:fs';

const file=(p:string)=>new URL('../'+p,import.meta.url);
test('removing old provider tables preserves Finnhub observations and trading records',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('CREATE TABLE quote_history(symbol TEXT,observed_at INTEGER,price_cents INTEGER);');
  db.exec('CREATE TABLE trades(id INTEGER, symbol TEXT);');
  db.exec("INSERT INTO quote_history VALUES ('NVDA',1795000000,12000);");
  db.exec('CREATE TABLE historical_ohlc(symbol TEXT);');
  db.exec('CREATE TABLE historical_backfill_state(symbol TEXT);');
  db.exec('CREATE TABLE historical_backfill_budget(day TEXT);');
  db.exec('CREATE TABLE historical_provider_pacing(id INTEGER);');
  const cleanup=readFileSync(file('migrations/0013_remove_external_history.sql'),'utf8');
  db.exec(cleanup);
  db.exec(cleanup);
  for(const name of ['historical_ohlc','historical_backfill_state',
                     'historical_backfill_budget','historical_provider_pacing'])
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name),undefined);
  const sampled=db.prepare('SELECT symbol,price_cents FROM quote_history').get();
  assert.equal(sampled?.symbol,'NVDA');
  assert.equal(sampled?.price_cents,12000);
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='trades'").get());
 }finally{db.close();}
});
test('external history implementation and obsolete migrations are absent',()=>{
 for(const path of ['worker/history.ts','migrations/0010_historical_backfill.sql',
   'migrations/0011_historical_backfill_diagnostics.sql','migrations/0012_history_provider_pacing.sql',
   'src/history-status.css','tests/history-status.test.ts',
   'tests/historical-backfill.test.ts','tests/history-chart-render.test.ts'])
  assert.equal(existsSync(file(path)),false,path);
 for(const path of ['worker/index.ts','worker/market.ts','src/PriceChart.tsx',
                    'src/main.tsx','shared/stocks.ts','README.md'])
  assert.doesNotMatch(readFileSync(file(path),'utf8'),/ALPHA_VANTAGE|alphavantage|Alpha Vantage|historyConfigured/);
 assert.match(readFileSync(file('README.md'),'utf8'),/Collected chart history only/);
});
