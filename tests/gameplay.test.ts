import assert from 'node:assert/strict';
import { test } from 'node:test';
import { easternDate, isClosingPrint, nextMarketSession, orderMatches, predictionResult } from '../worker/gameplay';

const at = (date: string) => Date.parse(date)/1000;

test('next prediction session skips weekends, holidays and shortened days after submission',()=>{
  assert.equal(nextMarketSession(at('2026-11-20T12:00:00Z')),'2026-11-20');
  assert.equal(nextMarketSession(at('2026-11-20T21:30:00Z')),'2026-11-23');
  assert.equal(nextMarketSession(at('2026-11-21T15:00:00Z')),'2026-11-23');
  assert.equal(nextMarketSession(at('2026-11-25T17:00:00Z')),'2026-11-27');
  assert.equal(nextMarketSession(at('2026-11-27T20:00:00Z')),'2026-11-30');
  assert.equal(easternDate(at('2026-11-27T20:00:00Z')),'2026-11-27');
});
test('market, limit and stop paper orders use correct inequality for each side',()=>{
  assert.equal(orderMatches('MARKET','BUY',null,100),true);
  assert.equal(orderMatches('MARKET','SELL',null,100),true);
  assert.equal(orderMatches('LIMIT','BUY',100,99),true);
  assert.equal(orderMatches('LIMIT','BUY',100,101),false);
  assert.equal(orderMatches('LIMIT','SELL',100,101),true);
  assert.equal(orderMatches('LIMIT','SELL',100,99),false);
  assert.equal(orderMatches('STOP','BUY',100,101),true);
  assert.equal(orderMatches('STOP','BUY',100,99),false);
  assert.equal(orderMatches('STOP','SELL',100,99),true);
  assert.equal(orderMatches('STOP','SELL',100,101),false);
  assert.equal(orderMatches('LIMIT','BUY',null,90),false);
});
test('forecasts grant points only for actual correct closing direction',()=>{
  assert.deepEqual(predictionResult('UP',100,101),{outcome:'CORRECT',points:10});
  assert.deepEqual(predictionResult('DOWN',100,99),{outcome:'CORRECT',points:10});
  assert.deepEqual(predictionResult('DOWN',100,101),{outcome:'INCORRECT',points:0});
  assert.deepEqual(predictionResult('UP',100,100),{outcome:'PUSH',points:0});
});
test('forecast settlement requires an actual print in last ten minutes of target session',()=>{
  assert.equal(isClosingPrint(at('2026-11-20T20:55:00Z'),'2026-11-20'),true);
  assert.equal(isClosingPrint(at('2026-11-20T20:20:00Z'),'2026-11-20'),false);
  assert.equal(isClosingPrint(at('2026-11-20T21:10:00Z'),'2026-11-20'),false);
  assert.equal(isClosingPrint(at('2026-11-20T20:55:00Z'),'2026-11-23'),false);
  assert.equal(isClosingPrint(at('2026-11-27T17:55:00Z'),'2026-11-27'),true);
});
