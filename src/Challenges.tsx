import { useState } from 'react';
import { Award, ArrowDownLeft, ArrowUpRight, CalendarClock, CheckCircle2, Clock3, Target, X } from 'lucide-react';
import { STOCKS, type Quote, type SymbolCode } from '../shared/stocks';
import type { Achievement, Prediction, PredictionDirection, PredictionSummary, QueuedOrder } from '../shared/gameplay';
import { money } from './PriceChart';

const formatTime = (seconds: number) => new Date(seconds*1000).toLocaleString();
const signed = (n:number) => n > 0 ? '+' + n : String(n);

export function Challenges({quotes,predictions,summary,achievements,pending,submit,openStock}:{
  quotes:Quote[];predictions:Prediction[];summary:PredictionSummary;achievements:Achievement[];pending:boolean;
  submit:(symbol:SymbolCode,direction:PredictionDirection)=>void;openStock:(symbol:SymbolCode)=>void;
}) {
  const [symbol,setSymbol] = useState<SymbolCode>('AAPL');
  const [direction,setDirection] = useState<PredictionDirection>('UP');
  const quote = quotes.find(q=>q.symbol===symbol);
  const {correct,settled,points}=summary;
  return <div className="challenge-layout">
    <section className="panel prediction-panel">
      <div className="panel-heading"><div><h2><Target size={18}/> Predict the next close</h2>
        <p>Will the next regular session close above or below today's reference price?</p></div>
        <span className="count-pill">10 PTS / CORRECT</span></div>
      <div className="prediction-compose">
        <label htmlFor="prediction-symbol" className="field-label">CHOOSE STOCK</label>
        <select id="prediction-symbol" value={symbol} onChange={e=>setSymbol(e.target.value as SymbolCode)}>
          {STOCKS.map(stock=><option key={stock.symbol} value={stock.symbol}>{stock.symbol} · {stock.name}</option>)}
        </select>
        <div className="prediction-price">Reference quote <strong>{quote ? money(quote.priceCents) : 'Loading…'}</strong>
          <small>Actual verified quote. Your prediction locks in this price at submission.</small></div>
        <div className="prediction-direction" role="group" aria-label="Choose predicted direction">
          <button type="button" className={direction==='UP' ? 'active up':''} aria-pressed={direction==='UP'} onClick={()=>setDirection('UP')}><ArrowUpRight size={19}/> Higher</button>
          <button type="button" className={direction==='DOWN' ? 'active down':''} aria-pressed={direction==='DOWN'} onClick={()=>setDirection('DOWN')}><ArrowDownLeft size={19}/> Lower</button>
        </div>
        <button type="button" className="execute-button buy" disabled={!quote || quote.stale || pending} onClick={()=>submit(symbol,direction)}>
          <Target size={17}/> {pending?'Submitting…':'Lock prediction'}
        </button>
        <p className="gameplay-hint">One prediction per stock for each upcoming session. Correct: 10 points. Exact tie: no points. Predictions are graded only from a verified near-close market print, so unavailable data can delay results.</p>
      </div>
    </section>
    <section className="panel prediction-history">
      <div className="panel-heading"><div><h2><CalendarClock size={18}/> Prediction record</h2><p>Your most recent calls and outcomes</p></div></div>
      <div className="prediction-totals">
        <div><span>POINTS</span><strong>{points}</strong></div>
        <div><span>CORRECT</span><strong>{correct}</strong></div>
        <div><span>ACCURACY</span><strong>{settled ? Math.round(correct/settled*100)+'%' : '—'}</strong></div>
      </div>
      <div className="prediction-list">
        {predictions.slice(0,30).map(p=><div className="prediction-row" key={p.id}>
          <div><strong>{p.symbol} <span className={p.direction==='UP'?'positive':'negative'}>{p.direction==='UP'?'↑ Higher':'↓ Lower'}</span></strong>
            <small>{p.targetDate} · Baseline {money(p.basePriceCents)}</small>
          </div>
          <div className="prediction-outcome"><strong className={p.outcome==='CORRECT'?'positive':p.outcome==='INCORRECT'?'negative':''}>{p.outcome==='PENDING'?'Pending':p.outcome==='PUSH'?'Tie':p.outcome==='CORRECT'?'Correct':'Missed'}</strong>
            <small>{p.closePriceCents ? money(p.closePriceCents)+' close · ' : ''}{signed(p.points)} pts</small></div>
        </div>)}
        {!predictions.length && <div className="rail-empty">No predictions yet. Make your first call above.</div>}
      </div>
    </section>
    <section className="panel achievement-panel">
      <div className="panel-heading"><div><h2><Award size={18}/> Achievements</h2><p>Permanent badges earned through trading and accurate calls</p></div>
        <span className="count-pill">{achievements.filter(a=>a.unlockedAt).length} / {achievements.length} UNLOCKED</span></div>
      <div className="achievement-grid">{achievements.map(a=><div key={a.code} className={'achievement '+(a.unlockedAt?'unlocked':'')}>
        <span className="achievement-icon">{a.unlockedAt?<CheckCircle2 size={22}/>:<Award size={22}/>}</span>
        <div className="achievement-info"><strong>{a.title}</strong><p>{a.description}</p>
          <div className="achievement-progress"><div style={{width:Math.min(100,a.progress/a.target*100)+'%'}}/></div>
          <small>{a.unlockedAt?'Unlocked '+new Date(a.unlockedAt*1000).toLocaleDateString():a.progress+' / '+a.target}</small>
        </div>
      </div>)}</div>
    </section>
    <section className="panel challenge-explore"><div className="panel-heading"><h2>Back to the market</h2></div>
      <div className="challenge-stocks">{quotes.slice(0,6).map(q=><button key={q.symbol} onClick={()=>openStock(q.symbol)} type="button">
        <span><strong>{q.symbol}</strong><small>{q.name}</small></span><strong>{money(q.priceCents)}</strong>
      </button>)}</div>
    </section>
  </div>;
}

export function OrderList({orders,onCancel,canceling,heading='Queued orders'}:{
  orders:QueuedOrder[];onCancel:(id:number)=>void;canceling:number|null;heading?:string;
}) {
  const active = orders.filter(o=>o.status==='PENDING'||o.status==='PROCESSING');
  const recent = orders.filter(o=>o.status!=='PENDING'&&o.status!=='PROCESSING').slice(0,8);
  return <section className="panel orders-panel">
    <div className="panel-heading"><div><h2><Clock3 size={18}/> {heading}</h2><p>Server processed when a fresh regular-session quote matches</p></div>
      <span className="count-pill">{active.length} ACTIVE</span></div>
    <div className="queued-list">{[...active,...recent].map(order=><div className="queued-row" key={order.id}>
      <div className="queued-description"><strong>{order.side} {order.shares} {order.symbol}</strong>
        <span>{order.kind}{order.triggerPriceCents ? ' · '+money(order.triggerPriceCents) : ''}</span>
        <small>{formatTime(order.createdAt)}</small>
      </div>
      <div className="queued-status"><strong className={order.status==='FILLED'?'positive':order.status==='REJECTED'?'negative':''}>{order.status.toLowerCase()}</strong>
        {order.fillPriceCents ? <small>Filled at {money(order.fillPriceCents)}</small> : null}
        {order.failureReason ? <small>{order.failureReason}</small> : null}
        {order.status==='PENDING' && <button type="button" disabled={canceling===order.id} onClick={()=>onCancel(order.id)} className="small-action"><X size={14}/> {canceling===order.id?'Canceling…':'Cancel'}</button>}
      </div>
    </div>)}
      {!orders.length && <div className="rail-empty">No queued orders. Use the trade ticket to schedule your next virtual trade.</div>}
    </div>
    <p className="gameplay-hint orders-foot">Pending orders do not reserve funds or shares. The server rejects orders without enough buying power or holdings when they trigger. Price fills are indicative, not exchange accurate.</p>
  </section>;
}
