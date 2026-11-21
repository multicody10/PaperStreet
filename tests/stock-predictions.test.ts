import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import type { Prediction } from '../shared/gameplay';
import { predictionsForStock } from '../src/StockPredictions';

const prediction=(id:number,symbol:'AAPL'|'MSFT',createdAt:number):Prediction=>({
  id,symbol,createdAt,direction:id%2?'UP':'DOWN',
  targetDate:'2026-11-23',basePriceCents:10000,closePriceCents:null,
  outcome:'PENDING',points:0,
});

test('stock history contains only predictions for the selected ticker',()=>{
  const source=[prediction(1,'AAPL',100),prediction(2,'MSFT',200),
    prediction(3,'AAPL',300),prediction(4,'MSFT',400)];
  assert.deepEqual(predictionsForStock(source,'AAPL').map(p=>p.id),[3,1]);
  assert.deepEqual(predictionsForStock(source,'MSFT').map(p=>p.id),[4,2]);
  assert.equal(predictionsForStock([],'AAPL').length,0);
});

test('stock history sorts most recent first without mutating the response',()=>{
  const source=[prediction(2,'AAPL',100),prediction(1,'AAPL',100),
    prediction(3,'AAPL',200)];
  const result=predictionsForStock(source,'AAPL');
  assert.deepEqual(result.map(p=>p.id),[3,2,1]);
  assert.deepEqual(source.map(p=>p.id),[2,1,3]);
  assert.notStrictEqual(result,source);
});

test('forecasts stay on stock pages while achievements also feed dashboard goals',()=>{
  // The UI uses the existing predictions endpoint, with no API or schema migration.
  // This check protects against regressions that put predictions back on Goals.
  const main=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
  const goals=readFileSync(new URL('../src/Challenges.tsx',import.meta.url),'utf8');
  assert.match(main,/if \(view === 'stock'\)\s+jobs.push\(request<\{ predictions: Prediction\[\] \}>\('\/api\/predictions'/);
  assert.match(main,/if \(view === 'dashboard' \|\| view === 'challenges'\)\s+jobs.push\(request<\{ achievements: Achievement\[\] \}>\('\/api\/achievements'/);
  assert.match(main,/await refresh\(token,'stock'\)/);
  const stock=readFileSync(new URL('../src/StockTerminal.tsx',import.meta.url),'utf8');
  assert.match(main,/tab === 'stock' \? <StockTerminal/);
  assert.match(stock,/<StockPredictions key=\{p\.symbol\} symbol=\{p\.symbol\} quote=\{p\.quote\} predictions=\{p\.predictions\}/);
  assert.doesNotMatch(goals,/\bpredictions\b|prediction-panel|prediction-history|submitForecast/);
});
