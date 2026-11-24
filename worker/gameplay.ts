import { isBuySide, ledgerSide, positionEffect, displaySideSql } from '../shared/gameplay';
import { isSymbol, type Quote, type SymbolCode } from '../shared/stocks';
import type { Achievement, AchievementCode, OrderKind, OrderSide, PredictionDirection, QueuedOrder, Prediction, PredictionSummary } from '../shared/gameplay';
import { isQuoteExecutable, isUsMarketOpen, quoteFor, type MarketEnv } from './market';
import { invalidateMemo } from './memo';

type OrderRow = { id: number; user_id: string; client_order_id: string; symbol: SymbolCode;
  side: OrderSide; shares: number; kind: OrderKind; trigger_price_cents: number | null;
  status: string; created_at: number; resolved_at: number | null;
  fill_price_cents: number | null; failure_reason: string | null };
type PredictionRow = { id: number; user_id: string; symbol: SymbolCode; direction: PredictionDirection;
  target_date: string; base_price_cents: number; close_price_cents: number | null;
  outcome: 'PENDING' | 'CORRECT' | 'INCORRECT' | 'PUSH'; points: number; created_at: number };
const et = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });

export function easternDate(seconds: number): string {
  const parts = Object.fromEntries(et.formatToParts(new Date(seconds * 1000)).map(({type,value}) => [type,value]));
  return [parts.year, parts.month, parts.day].join('-');
}
export function nextMarketSession(now = Math.floor(Date.now() / 1000)): string {
  const start = easternDate(now);
  const hhmm = new Intl.DateTimeFormat('en-US', {timeZone:'America/New_York',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now*1000));
  const parts = Object.fromEntries(hhmm.map(({type,value})=>[type,value]));
  const beforeOpen = Number(parts.hour)*60+Number(parts.minute)<570;
  if (beforeOpen && isUsMarketOpen(Date.parse(start+'T17:00:00Z')/1000)) return start;
  for (let i = 1; i <= 12; i++) {
    const date = new Date(Date.parse(start + 'T12:00:00Z') + i * 86400000).toISOString().slice(0, 10);
    // 17 UTC is noon ET, whether EDT or EST.
    if (isUsMarketOpen(Date.parse(date + 'T17:00:00Z') / 1000)) return date;
  }
  throw new Error('Unable to determine the next stock market session');
}
export function orderMatches(kind: OrderKind, side: OrderSide, trigger: number | null, price: number): boolean {
  if (kind === 'MARKET') return true;
  if (!trigger || !Number.isSafeInteger(trigger)) return false;
  return kind === 'LIMIT' ? isBuySide(side) ? price <= trigger : price >= trigger
    : isBuySide(side) ? price >= trigger : price <= trigger;
}
export function predictionResult(direction: PredictionDirection, baseline: number, close: number) {
  const outcome = close === baseline ? 'PUSH' :
    (direction === 'UP' ? close > baseline : close < baseline) ? 'CORRECT' : 'INCORRECT';
  return { outcome, points: outcome === 'CORRECT' ? 10 : 0 } as const;
}
export function isClosingPrint(at: number, targetDate: string): boolean {
  return easternDate(at) === targetDate && isUsMarketOpen(at) && !isUsMarketOpen(at + 600);
}
const asOrder = (row: OrderRow): QueuedOrder => ({
  id: row.id, symbol: row.symbol, side: row.side, shares: row.shares, kind: row.kind,
  triggerPriceCents: row.trigger_price_cents, status: row.status as QueuedOrder['status'],
  createdAt: row.created_at, resolvedAt: row.resolved_at,
  fillPriceCents: row.fill_price_cents, failureReason: row.failure_reason,
});
const asPrediction = (row: PredictionRow): Prediction => ({
  id: row.id, symbol: row.symbol, direction: row.direction, targetDate: row.target_date,
  basePriceCents: row.base_price_cents, closePriceCents: row.close_price_cents,
  outcome: row.outcome, points: row.points, createdAt: row.created_at,
});
const orderColumns = `id,user_id,client_order_id,symbol,${displaySideSql()} AS side,shares,kind,trigger_price_cents,status,created_at,resolved_at,fill_price_cents,failure_reason`;
const predictionColumns = 'id,user_id,symbol,direction,target_date,base_price_cents,close_price_cents,outcome,points,created_at';

export async function listOrders(userId: string, env: MarketEnv): Promise<QueuedOrder[]> {
  const { results } = await env.DB.prepare('SELECT ' + orderColumns + ' FROM queued_orders WHERE user_id=? ORDER BY CASE WHEN status IN (\'PENDING\',\'PROCESSING\') THEN 0 ELSE 1 END, created_at DESC, id DESC LIMIT 60').bind(userId).all<OrderRow>();
  return results.map(asOrder);
}
export async function queueOrder(env: MarketEnv, userId: string, input: {
  orderId: string; symbol: SymbolCode; side: OrderSide; shares: number; kind: OrderKind; triggerPriceCents: number | null; channelId?: string | null;
}): Promise<QueuedOrder> {
  const prior = await env.DB.prepare('SELECT ' + orderColumns + ' FROM queued_orders WHERE user_id=? AND client_order_id=?').bind(userId,input.orderId).first<OrderRow>();
  if (prior) return asOrder(prior);
  const active = await env.DB.prepare("SELECT COUNT(*) AS n FROM queued_orders WHERE user_id=? AND status IN ('PENDING','PROCESSING')").bind(userId).first<{n:number}>();
  if ((active?.n ?? 0) >= 30) throw new Error('You can have at most 30 open queued orders.');
  const created = await env.DB.prepare('INSERT INTO queued_orders(user_id,client_order_id,symbol,side,shares,kind,trigger_price_cents,channel_id,position_effect) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,client_order_id) DO NOTHING RETURNING id')
    .bind(userId,input.orderId,input.symbol,ledgerSide(input.side),input.shares,input.kind,input.triggerPriceCents,input.channelId??null,positionEffect(input.side)).first<{id:number}>();
  const id = created?.id;
  const row = await env.DB.prepare('SELECT ' + orderColumns + ' FROM queued_orders WHERE user_id=? AND ' + (id ? 'id=?' : 'client_order_id=?')).bind(userId,id ?? input.orderId).first<OrderRow>();
  if (!row) throw new Error('Unable to save queued order');
  return asOrder(row);
}
export async function cancelOrder(env: MarketEnv, userId: string, id: number): Promise<boolean> {
  const result = await env.DB.prepare("UPDATE queued_orders SET status='CANCELED',resolved_at=unixepoch() WHERE user_id=? AND id=? AND status='PENDING' RETURNING id").bind(userId,id).first<{id:number}>();
  return !!result;
}

export async function processQueuedOrders(env: MarketEnv, now = Math.floor(Date.now()/1000)): Promise<number> {
  if (!isUsMarketOpen(now) || !env.FINNHUB_API_KEY) return 0;
  await env.DB.prepare("UPDATE queued_orders SET status='PENDING',claimed_at=NULL WHERE status='PROCESSING' AND claimed_at < ?").bind(now-120).run();
  const { results } = await env.DB.prepare("SELECT " + orderColumns + " FROM queued_orders WHERE status='PENDING' ORDER BY last_checked_at,created_at,id LIMIT 40").all<OrderRow>();
  if (!results.length) return 0;
  // Round-robin through open orders so old untriggered limits cannot starve new market orders.
  await env.DB.prepare("UPDATE queued_orders SET last_checked_at=? WHERE status='PENDING' AND id IN (" +
    results.map(() => '?').join(',') + ")").bind(now,...results.map(r=>r.id)).run();
  const quotes = new Map<SymbolCode, Quote>();
  for (const row of results) {
    if (!isSymbol(row.symbol)) continue;
    if (!quotes.has(row.symbol)) {
      try { quotes.set(row.symbol, await quoteFor(row.symbol,env,now)); } catch { continue; }
    }
  }
  let filled = 0;
  for (const row of results) {
    const quote = quotes.get(row.symbol);
    // Never fill queued orders against after-hours, premarket or stale prints.
    if (!quote || !isQuoteExecutable(quote) || !isUsMarketOpen(quote.fetchedAt) ||
        !orderMatches(row.kind,row.side,row.trigger_price_cents,quote.priceCents)) continue;
    const claim = await env.DB.prepare("UPDATE queued_orders SET status='PROCESSING',claimed_at=? WHERE id=? AND status='PENDING' RETURNING id").bind(now,row.id).first<{id:number}>();
    if (!claim) continue;
    try {
      let trade = await env.DB.prepare('SELECT id FROM trades WHERE user_id=? AND client_order_id=?').bind(row.user_id,row.client_order_id).first<{id:number}>();
      if (!trade) {
        trade = await env.DB.prepare('INSERT INTO trades(user_id,client_order_id,symbol,side,shares,price_cents,position_effect) VALUES(?,?,?,?,?,?,?) RETURNING id')
          .bind(row.user_id,row.client_order_id,row.symbol,ledgerSide(row.side),row.shares,quote.priceCents,positionEffect(row.side)).first<{id:number}>();
      }
      await env.DB.prepare("UPDATE queued_orders SET status='FILLED',resolved_at=?,fill_price_cents=?,failure_reason=NULL WHERE id=? AND status='PROCESSING'")
        .bind(now,quote.priceCents,row.id).run();
      filled++;
    } catch (error) {
      const message = String(error);
      if (message.includes('UNIQUE constraint failed')) {
        const traded = await env.DB.prepare('SELECT id FROM trades WHERE user_id=? AND client_order_id=?').bind(row.user_id,row.client_order_id).first<{id:number}>();
        if (traded) {
          await env.DB.prepare("UPDATE queued_orders SET status='FILLED',resolved_at=?,fill_price_cents=(SELECT price_cents FROM trades WHERE user_id=? AND client_order_id=?) WHERE id=?")
            .bind(now,row.user_id,row.client_order_id,row.id).run();
          filled++; continue;
        }
      }
      const reason = ['Insufficient cash for short collateral','Insufficient short shares','Close short position first','Close long position first','Short position limit exceeded','Insufficient cash','Insufficient shares'].find(r=>message.includes(r));
      const rejected = !!reason;
      await env.DB.prepare("UPDATE queued_orders SET status=?,claimed_at=NULL,resolved_at=?,failure_reason=? WHERE id=? AND status='PROCESSING'")
        .bind(rejected ? 'REJECTED' : 'PENDING',rejected ? now : null,
          reason ? reason+' at execution' : null,row.id).run();
      if (!rejected) console.error('Queued order retryable failure',row.id);
    }
  }
  if (filled) invalidateMemo('leaderboard');
  return filled;
}

export async function listPredictions(userId: string, env: MarketEnv): Promise<Prediction[]> {
  const { results } = await env.DB.prepare('SELECT ' + predictionColumns + ' FROM predictions WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 60').bind(userId).all<PredictionRow>();
  return results.map(asPrediction);
}
export async function getPredictionSummary(userId:string,env:MarketEnv):Promise<PredictionSummary> {
  const row = await env.DB.prepare("SELECT COALESCE(SUM(points),0) AS points, SUM(CASE WHEN outcome='CORRECT' THEN 1 ELSE 0 END) AS correct, SUM(CASE WHEN outcome IN ('CORRECT','INCORRECT') THEN 1 ELSE 0 END) AS settled FROM predictions WHERE user_id=?")
    .bind(userId).first<{points:number;correct:number|null;settled:number|null}>();
  return {points:row?.points??0,correct:row?.correct??0,settled:row?.settled??0};
}
export async function submitPrediction(env: MarketEnv, userId: string, symbol: SymbolCode, direction: PredictionDirection, now = Math.floor(Date.now()/1000)): Promise<Prediction> {
  const targetDate = nextMarketSession(now);
  const prior = await env.DB.prepare('SELECT ' + predictionColumns + ' FROM predictions WHERE user_id=? AND symbol=? AND target_date=?')
    .bind(userId,symbol,targetDate).first<PredictionRow>();
  if (prior) throw new Error('You already predicted this stock for the next session.');
  const quote = await quoteFor(symbol,env,now);
  if (!isQuoteExecutable(quote)) throw new Error('A sufficiently recent verified quote is required to predict.');
  const inserted = await env.DB.prepare('INSERT INTO predictions(user_id,symbol,direction,target_date,base_price_cents) VALUES(?,?,?,?,?) ON CONFLICT(user_id,symbol,target_date) DO NOTHING RETURNING id')
    .bind(userId,symbol,direction,targetDate,quote.priceCents).first<{id:number}>();
  if (!inserted) throw new Error('You already predicted this stock for the next session.');
  const row = await env.DB.prepare('SELECT ' + predictionColumns + ' FROM predictions WHERE id=?').bind(inserted.id).first<PredictionRow>();
  if (!row) throw new Error('Could not load prediction');
  return asPrediction(row);
}
export async function settlePredictions(env: MarketEnv, now = Math.floor(Date.now()/1000)): Promise<number> {
  // Defer settlement until a later trading day; same-day near-close prints are not final closes.
  const today = easternDate(now);
  const { results } = await env.DB.prepare("SELECT " + predictionColumns + " FROM predictions WHERE outcome='PENDING' AND target_date<? ORDER BY last_checked_at,target_date DESC,id LIMIT 40").bind(today).all<PredictionRow>();
  if (!results.length) return 0;
  await env.DB.prepare("UPDATE predictions SET last_checked_at=? WHERE outcome='PENDING' AND id IN (" +
    results.map(() => '?').join(',') + ")").bind(now,...results.map(r=>r.id)).run();
  const closes = new Map<string,number | null>();
  let settled = 0;
  for (const row of results) {
    if (!isSymbol(row.symbol)) continue;
    const key = row.symbol + ':' + row.target_date;
    if (!closes.has(key)) {
      // Use an actual provider observation recorded near the target session's close.
      // Never substitute today's quote for a missed prior session.
      const from = Date.parse(row.target_date + 'T00:00:00Z')/1000;
      const { results: prints } = await env.DB.prepare('SELECT observed_at AS at,price_cents AS price FROM quote_history WHERE symbol=? AND observed_at>=? AND observed_at<? ORDER BY observed_at DESC LIMIT 40')
        .bind(row.symbol,from,from+86400).all<{at:number;price:number}>();
      closes.set(key, prints.find(p=>isClosingPrint(p.at,row.target_date))?.price ?? null);
    }
    const close = closes.get(key);
    if (close == null) continue;
    const result = predictionResult(row.direction,row.base_price_cents,close);
    const updated = await env.DB.prepare("UPDATE predictions SET outcome=?,points=?,close_price_cents=?,resolved_at=? WHERE id=? AND outcome='PENDING' RETURNING id")
      .bind(result.outcome,result.points,close,now,row.id).first<{id:number}>();
    if (updated) settled++;
  }
  return settled;
}

const definitions: { code: AchievementCode; title:string; description:string; target:number; metric: 'trades'|'predictions'|'correct'|'assets' }[] = [
  {code:'first_trade',title:'First Trade',description:'Complete your first virtual trade.',target:1,metric:'trades'},
  {code:'five_trades',title:'Getting Started',description:'Complete 5 virtual trades.',target:5,metric:'trades'},
  {code:'twenty_five_trades',title:'Market Regular',description:'Complete 25 virtual trades.',target:25,metric:'trades'},
  {code:'first_prediction',title:'Market Forecaster',description:'Make your first market prediction.',target:1,metric:'predictions'},
  {code:'ten_predictions',title:'Crystal Ball',description:'Make 10 market predictions.',target:10,metric:'predictions'},
  {code:'three_correct',title:'On The Money',description:'Get 3 predictions correct.',target:3,metric:'correct'},
  {code:'five_assets',title:'Diversified',description:'Hold shares of 5 different stocks.',target:5,metric:'assets'},
];
export async function getAchievements(env: MarketEnv, userId: string): Promise<Achievement[]> {
  const stats = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM trades WHERE user_id=?) AS trades, (SELECT COUNT(*) FROM predictions WHERE user_id=?) AS predictions, (SELECT COUNT(*) FROM predictions WHERE user_id=? AND outcome=\'CORRECT\') AS correct, (SELECT COUNT(*) FROM holdings WHERE user_id=? AND shares>0) AS assets')
    .bind(userId,userId,userId,userId).first<{trades:number;predictions:number;correct:number;assets:number}>();
  const current = stats ?? {trades:0,predictions:0,correct:0,assets:0};
  const {results} = await env.DB.prepare('SELECT code,unlocked_at FROM player_achievements WHERE user_id=?').bind(userId).all<{code:AchievementCode;unlocked_at:number}>();
  const unlocked = new Map(results.map(r=>[r.code,r.unlocked_at]));
  for (const definition of definitions) {
    if (current[definition.metric] >= definition.target && !unlocked.has(definition.code)) {
      const inserted = await env.DB.prepare('INSERT OR IGNORE INTO player_achievements(user_id,code) VALUES(?,?) RETURNING unlocked_at AS at')
        .bind(userId,definition.code).first<{at:number}>();
      if (inserted) unlocked.set(definition.code,inserted.at);
    }
  }
  return definitions.map(d=>({
    code:d.code,title:d.title,description:d.description,target:d.target,
    progress:Math.min(current[d.metric],d.target),unlockedAt:unlocked.get(d.code)??null,
  }));
}
