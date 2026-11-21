import type { Candle, ChartHistory, HistoryRange, SymbolCode } from '../shared/stocks';
import { easternMarketClock, marketSessionOn } from '../shared/marketCalendar';
import { invalidateMemo } from './memo';

export type Resolution = 'daily'|'weekly';
export interface HistoryEnv { DB:D1Database; ALPHA_VANTAGE_API_KEY?:string }
export type HistoricalBar = {date:string;at:number;openCents:number;highCents:number;lowCents:number;closeCents:number};
const DAY=86400, WEEK=604800, MAX_PRICE=100_000_000, BUDGET=20;
const keys = {daily:'Time Series (Daily)',weekly:'Weekly Time Series'} as const;
const funcs = {daily:'TIME_SERIES_DAILY',weekly:'TIME_SERIES_WEEKLY'} as const;

export function historyResolution(range:HistoryRange):Resolution|null {
  return range==='1D'?null:range==='ALL'||range==='1Y'?'weekly':'daily';
}
const cents=(raw:unknown):number|null=>{
  if(typeof raw!=='number' && (typeof raw!=='string'||!/^(?:\d+)(?:\.\d+)?$/.test(raw)))return null;
  const v=Math.round(Number(raw)*100);
  return Number.isSafeInteger(v)&&v>0&&v<=MAX_PRICE?v:null;
};
// Convert the exchange date to its completed NYSE session close (handles DST
// and the 1pm early-close days), without treating midnight UTC as a session.
export function sessionCloseAt(date:string):number|null {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
  const start=Date.parse(date+'T00:00:00Z');
  if(!Number.isFinite(start)||new Date(start).toISOString().slice(0,10)!==date)return null;
  const market=marketSessionOn(date);
  if(market.kind==='closed')return null;
  const noon=easternMarketClock(new Date(start+12*3600*1000));
  return Math.floor(start/1000)+(market.closeMinute+720-noon.minute)*60;
}
export function parseHistoricalSeries(raw:unknown,resolution:Resolution,now:number):HistoricalBar[] {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return [];
  const series=(raw as Record<string,unknown>)[keys[resolution]];
  if(!series||typeof series!=='object'||Array.isArray(series))return [];
  const entries=Object.entries(series as Record<string,unknown>);
  if(entries.length>8000)return []; // Reject absurdly large/untrusted responses.
  const oldestAllowed=now-30*365.25*DAY; // Bounded ~30 years for long-lived listings.
  const out:HistoricalBar[]=[];
  for(const [date,item] of entries){
    const at=sessionCloseAt(date);
    if(!at||at>now-60||at<oldestAllowed||!item||typeof item!=='object')continue;
    const bar=item as Record<string,unknown>;
    const openCents=cents(bar['1. open']),highCents=cents(bar['2. high']);
    const lowCents=cents(bar['3. low']),closeCents=cents(bar['4. close']);
    if(openCents===null||highCents===null||lowCents===null||closeCents===null||
       lowCents>Math.min(openCents,closeCents)||highCents<Math.max(openCents,closeCents)||
       lowCents>highCents)continue;
    out.push({date,at,openCents,highCents,lowCents,closeCents});
  }
  return out.sort((a,b)=>a.at-b.at);
}

// Optional, bounded, provider-only import. A single shared D1 lease blocks
// duplicate simultaneous calls from different Discord clients/Worker isolates.
export async function backfillHistoricalBars(
  symbol:SymbolCode,range:HistoryRange,env:HistoryEnv,
  now=Math.floor(Date.now()/1000),
):Promise<boolean>{
  const resolution=historyResolution(range);
  if(!resolution||!env.ALPHA_VANTAGE_API_KEY)return false;
  const lease=await env.DB.prepare(`INSERT INTO historical_backfill_state(symbol,resolution,next_attempt_at)
    VALUES(?,?,?) ON CONFLICT(symbol,resolution) DO UPDATE SET
    next_attempt_at=excluded.next_attempt_at
    WHERE historical_backfill_state.next_attempt_at<=? RETURNING symbol`)
    .bind(symbol,resolution,now+DAY,now).first<{symbol:string}>();
  if(!lease)return false;
  let success=false;
  try{
    const day=new Date(now*1000).toISOString().slice(0,10);
    await env.DB.prepare('INSERT OR IGNORE INTO historical_backfill_budget(day,requests) VALUES(?,0)').bind(day).run();
    const allowed=await env.DB.prepare(`UPDATE historical_backfill_budget
      SET requests=requests+1 WHERE day=? AND requests<? RETURNING requests`)
      .bind(day,BUDGET).first<{requests:number}>();
    if(!allowed)return false;
    const url=new URL('https://www.alphavantage.co/query');
    url.searchParams.set('function',funcs[resolution]);
    url.searchParams.set('symbol',symbol);
    if(resolution==='daily')url.searchParams.set('outputsize','compact');
    url.searchParams.set('apikey',env.ALPHA_VANTAGE_API_KEY);
    // Never log URL (contains a secret) or any provider response body.
    const response=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(9000)});
    if(!response.ok)return false;
    const bars=parseHistoricalSeries(await response.json() as unknown,resolution,now);
    if(!bars.length)return false; // Provider quota, premium restriction or unavailable data.
    for(let i=0;i<bars.length;i+=60){
      await env.DB.batch(bars.slice(i,i+60).map(b=>env.DB.prepare(`
        INSERT INTO historical_ohlc(symbol,resolution,session_date,close_at,
          open_cents,high_cents,low_cents,close_cents) VALUES(?,?,?,?,?,?,?,?)
        ON CONFLICT(symbol,resolution,session_date) DO UPDATE SET
        close_at=excluded.close_at,open_cents=excluded.open_cents,
        high_cents=excluded.high_cents,low_cents=excluded.low_cents,
        close_cents=excluded.close_cents`)
        .bind(symbol,resolution,b.date,b.at,b.openCents,b.highCents,b.lowCents,b.closeCents)));
    }
    invalidateMemo('history:'+symbol+':');
    success=true;
    return true;
  }catch{return false;}finally{
    await env.DB.prepare(`UPDATE historical_backfill_state
      SET next_attempt_at=?,last_success_at=CASE WHEN ? THEN ? ELSE last_success_at END
      WHERE symbol=? AND resolution=?`)
      .bind(now+(success?7*DAY:DAY),success?1:0,now,symbol,resolution).run().catch(()=>{});
  }
}
export async function historicalCandles(
  symbol:SymbolCode,range:HistoryRange,env:HistoryEnv,now:number,
):Promise<ChartHistory|null>{
  const resolution=historyResolution(range);
  if(!resolution)return null;
  const windows:{[key:string]:number}={'1W':7*DAY,'1M':30*DAY,'3M':90*DAY,'1Y':365*DAY};
  const from=range==='ALL'?0:now-windows[range];
  const earliest=await env.DB.prepare(`SELECT MIN(close_at) at FROM historical_ohlc
    WHERE symbol=? AND resolution=? AND close_at>=? AND close_at<=?`)
    .bind(symbol,resolution,from,now).first<{at:number|null}>();
  if(!earliest?.at)return null;
  const bucketSeconds=range==='ALL'?
    Math.max(WEEK,Math.ceil((now-earliest.at)/(120*WEEK))*WEEK):
    resolution==='weekly'?WEEK:DAY;
  const {results}=await env.DB.prepare(`WITH buckets AS(
    SELECT MIN(close_at) firstAt,MAX(close_at) lastAt,
      MIN(low_cents) lowCents,MAX(high_cents) highCents,COUNT(*) samples
    FROM historical_ohlc WHERE symbol=? AND resolution=? AND close_at>=? AND close_at<=?
    GROUP BY CAST((close_at-345600)/? AS INTEGER)
  )
  SELECT buckets.*,first.open_cents openCents,last.close_cents closeCents
  FROM buckets
  JOIN historical_ohlc first ON first.symbol=? AND first.resolution=? AND first.close_at=buckets.firstAt
  JOIN historical_ohlc last ON last.symbol=? AND last.resolution=? AND last.close_at=buckets.lastAt
  ORDER BY buckets.firstAt`).bind(symbol,resolution,from,now,bucketSeconds,
    symbol,resolution,symbol,resolution).all<Candle>();
  return results.length?{candles:results,bucketSeconds,source:'alphavantage',resolution}:null;
}
