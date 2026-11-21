import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { easternMarketClock, marketSessionOn, nextMarketOpening } from '../shared/marketCalendar';
import { isUsMarketOpen } from '../worker/market';

const at = (iso: string) => new Date(iso);
const file = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('calendar shares live exchange session hours with backend across EST and EDT', () => {
  for (const [instant,expected] of [
    ['2026-11-20T14:29:00Z',false], ['2026-11-20T14:30:00Z',true],
    ['2026-11-20T20:59:00Z',true], ['2026-11-20T21:00:00Z',false],
    ['2026-07-07T13:29:00Z',false], ['2026-07-07T13:30:00Z',true],
    ['2026-07-07T20:00:00Z',false], ['2026-11-21T16:00:00Z',false],
    ['2026-11-27T17:59:00Z',true], ['2026-11-27T18:00:00Z',false],
  ] as const) assert.equal(isUsMarketOpen(at(instant).getTime()/1000), expected, instant);
  assert.deepEqual(easternMarketClock(at('2026-07-07T13:30:00Z')),
    {date:'2026-07-07',minute:570});
  assert.deepEqual(easternMarketClock(at('2026-11-20T14:30:00Z')),
    {date:'2026-11-20',minute:570});
});
test('month includes market days, weekends, holidays and shortened sessions', () => {
  assert.equal(marketSessionOn('2026-11-21').reason,'Weekend');
  assert.equal(marketSessionOn('2026-11-23').kind,'regular');
  assert.equal(marketSessionOn('2026-11-26').reason,'Thanksgiving Day');
  assert.deepEqual(marketSessionOn('2026-11-27'),{
    kind:'early',reason:'Early close at 1:00 PM ET',closeMinute:780,
  });
  assert.equal(marketSessionOn('2026-12-24').kind,'early');
  assert.equal(marketSessionOn('2026-12-25').reason,'Christmas Day');
  assert.equal(marketSessionOn('2026-07-03').reason,'Independence Day');
  assert.equal(marketSessionOn('2027-12-24').reason,'Christmas Day');
  assert.equal(marketSessionOn('2027-12-31').kind,'regular'); // NYSE 2028 New Year exception
  assert.equal(marketSessionOn('2028-07-03').kind,'early');
});
test('next market open uses New York calendar and skips holidays', () => {
  assert.equal(nextMarketOpening(at('2026-11-21T16:00:00Z')),'2026-11-23');
  assert.equal(nextMarketOpening(at('2026-11-23T14:29:00Z')),'2026-11-23');
  assert.equal(nextMarketOpening(at('2026-11-23T14:30:00Z')),'2026-11-24');
  assert.equal(nextMarketOpening(at('2026-11-25T21:00:00Z')),'2026-11-27');
  assert.equal(nextMarketOpening(at('2026-11-27T18:00:00Z')),'2026-11-30');
});
test('header status opens a real accessible calendar without changing trading routes', () => {
  const main = file('src/main.tsx');
  const ui = file('src/MarketSchedule.tsx');
  const css = file('src/market-schedule.css');
  const market = file('worker/market.ts');
  assert.match(main, /<MarketSchedule marketOpen=/);
  assert.match(ui, /createPortal\(/);
  assert.match(ui, /onMouseEnter=\{show\}/);
  assert.match(ui, /onFocus=\{show\}/);
  assert.match(ui, /aria-haspopup="dialog"/);
  assert.match(ui, /role="dialog"/);
  assert.match(ui, /nextMarketOpening\(now\)/);
  assert.match(ui, /marketSessionOn\(date\)/);
  assert.match(ui, /market-hours-grid/);
  assert.match(css, /position:fixed;z-index:10000/);
  assert.match(market, /marketSessionOn\(date\)/);
  assert.match(file('worker/index.ts'), /if \(!isUsMarketOpen\(\)\) return noStore/);
});

test('the market calendar fits inside its popover without a scrollbar',()=>{
 const css=file('src/market-schedule.css');
 const ui=file('src/MarketSchedule.tsx');
 assert.match(css,/max-height:calc\(100dvh - 16px\);overflow:hidden/);
 assert.doesNotMatch(css,/overflow-y:auto/);
 assert.match(ui,/window.innerHeight-height-8/);
 assert.match(ui,/ResizeObserver\(place\)/);
});
