import { useState } from 'react';
import { Award, ArrowDownLeft, ArrowUpRight, CalendarClock, CheckCircle2, Clock3, Target, X } from 'lucide-react';
import { STOCKS, type Quote, type SymbolCode } from '../shared/stocks';
import type { Achievement, Prediction, PredictionDirection, PredictionSummary, QueuedOrder } from '../shared/gameplay';
import { FitPager, SectionTabs } from './FitPager';
import { money } from './PriceChart';

const formatTime = (seconds:number) => new Date(seconds*1000).toLocaleString();
const directions = [{id:'forecast',label:'Predict'}, {id:'history',label:'History'},
  {id:'badges',label:'Badges'}, {id:'stocks',label:'Stocks'}] as const;
type ChallengeTab = typeof directions[number]['id'];

export function Challenges({quotes,predictions,summary,achievements,pending,submit,openStock}:{
  quotes:Quote[];predictions:Prediction[];summary:PredictionSummary;achievements:Achievement[];
  pending:boolean;submit:(symbol:SymbolCode,direction:PredictionDirection)=>void;openStock:(symbol:SymbolCode)=>void;
}) {
  const [tab,setTab]=useState<ChallengeTab>('forecast');
  const [symbol,setSymbol]=useState<SymbolCode>('AAPL');
  const [direction,setDirection]=useState<PredictionDirection>('UP');
  const [review,setReview]=useState(false);
  const quote=quotes.find(q=>q.symbol===symbol);
  return <div className="challenge-layout fitted-panel">
    <SectionTabs items={directions} value={tab} onChange={setTab} label="Challenge sections"/>
    {tab==='forecast' && <section className="panel prediction-panel">
      <div className="panel-heading"><h2><Target size={18}/> Next session</h2><span className="count-pill">+10 PTS</span></div>
      <div className="prediction-compose">
        {!review ? <>
          <label htmlFor="prediction-symbol" className="field-label">STOCK</label>
          <select id="prediction-symbol" value={symbol} onChange={e=>setSymbol(e.target.value as SymbolCode)}>
            {STOCKS.map(s=><option key={s.symbol} value={s.symbol}>{s.symbol} · {s.name}</option>)}
          </select>
          <div className="prediction-direction" role="group" aria-label="Direction">
            <button type="button" aria-pressed={direction==='UP'} className={direction==='UP'?'active up':''} onClick={()=>setDirection('UP')}><ArrowUpRight size={19}/> Higher</button>
            <button type="button" aria-pressed={direction==='DOWN'} className={direction==='DOWN'?'active down':''} onClick={()=>setDirection('DOWN')}><ArrowDownLeft size={19}/> Lower</button>
          </div>
          <button type="button" className="execute-button buy" disabled={!quote||quote.stale} onClick={()=>setReview(true)}>Review call</button>
        </> : <>
          <div className="prediction-price"><strong>{symbol} {direction==='UP'?'↑ Higher':'↓ Lower'}</strong><span>{quote?money(quote.priceCents):'Loading…'} reference</span></div>
          <button type="button" className="execute-button buy" disabled={!quote||quote.stale||pending}
            onClick={()=>submit(symbol,direction)}><Target size={17}/>{pending?'Submitting…':'Lock prediction'}</button>
          <button type="button" className="subtle-link" onClick={()=>setReview(false)}>Back</button>
          <p className="gameplay-hint">One call per stock per session. Verified closing quotes determine results.</p>
        </>}
      </div>
    </section>}
    {tab==='history' && <section className="panel prediction-history">
      <div className="panel-heading"><h2><CalendarClock size={18}/> Prediction history</h2></div>
      <div className="prediction-totals">
        <div><span>POINTS</span><strong>{summary.points}</strong></div>
        <div><span>CORRECT</span><strong>{summary.correct}</strong></div>
        <div><span>ACCURACY</span><strong>{summary.settled?Math.round(summary.correct/summary.settled*100)+'%':'—'}</strong></div>
      </div>
      <FitPager items={predictions} rowHeight={66} compactRowHeight={75} empty="No predictions yet."
        render={items=><div className="prediction-list">{items.map(p=><div className="prediction-row" key={p.id}>
          <div><strong>{p.symbol} <span className={p.direction==='UP'?'positive':'negative'}>{p.direction==='UP'?'↑ Higher':'↓ Lower'}</span></strong>
            <small>{p.targetDate} · {money(p.basePriceCents)}</small></div>
          <div className="prediction-outcome">
            <strong className={p.outcome==='CORRECT'?'positive':p.outcome==='INCORRECT'?'negative':''}>
              {p.outcome==='PENDING'?'Pending':p.outcome==='PUSH'?'Tie':p.outcome==='CORRECT'?'Correct':'Missed'}
            </strong>
            <small>{p.closePriceCents?money(p.closePriceCents)+' · ':''}{p.points>0?'+':''}{p.points} pts</small>
          </div>
        </div>)}</div>}/>
    </section>}
    {tab==='badges' && <section className="panel achievement-panel">
      <div className="panel-heading"><h2><Award size={18}/> Achievements</h2>
        <span className="count-pill">{achievements.filter(a=>a.unlockedAt).length} / {achievements.length}</span></div>
      <FitPager items={achievements} rowHeight={94} compactRowHeight={104} empty="Achievements unavailable."
        render={items=><div className="achievement-grid">{items.map(a=><div key={a.code} className={'achievement '+(a.unlockedAt?'unlocked':'')}>
          <span className="achievement-icon">{a.unlockedAt?<CheckCircle2 size={22}/>:<Award size={22}/>}</span>
          <div className="achievement-info"><strong>{a.title}</strong><p>{a.description}</p>
            <div className="achievement-progress"><div style={{width:Math.min(100,a.progress/a.target*100)+'%'}}/></div>
            <small>{a.unlockedAt?'Unlocked '+new Date(a.unlockedAt*1000).toLocaleDateString():a.progress+' / '+a.target}</small>
          </div>
        </div>)}</div>}/>
    </section>}
    {tab==='stocks' && <section className="panel challenge-explore">
      <div className="panel-heading"><h2>Browse stocks</h2></div>
      <FitPager items={quotes} rowHeight={60} compactRowHeight={65} empty="Market data unavailable."
        render={items=><div className="challenge-stocks">{items.map(q=><button key={q.symbol} type="button" onClick={()=>openStock(q.symbol)}>
          <span><strong>{q.symbol}</strong><small>{q.name}</small></span><strong>{money(q.priceCents)}</strong>
        </button>)}</div>}/>
    </section>}
  </div>;
}

export function OrderList({orders,onCancel,canceling,heading='Queued orders'}:{
  orders:QueuedOrder[];onCancel:(id:number)=>void;canceling:number|null;heading?:string;
}) {
  const active=orders.filter(o=>o.status==='PENDING'||o.status==='PROCESSING');
  const recent=orders.filter(o=>o.status!=='PENDING'&&o.status!=='PROCESSING');
  const ordered=[...active,...recent];
  return <section className="panel orders-panel">
    <div className="panel-heading"><h2><Clock3 size={18}/> {heading}</h2>
      <span className="count-pill">{active.length} ACTIVE</span></div>
    <FitPager items={ordered} rowHeight={80} compactRowHeight={92} empty="No queued orders."
      render={items=><div className="queued-list">{items.map(order=><div className="queued-row" key={order.id}>
        <div className="queued-description"><strong>{order.side} {order.shares} {order.symbol}</strong>
          <span>{order.kind}{order.triggerPriceCents?' · '+money(order.triggerPriceCents):''}</span>
          <small>{formatTime(order.createdAt)}</small>
        </div>
        <div className="queued-status"><strong className={order.status==='FILLED'?'positive':order.status==='REJECTED'?'negative':''}>{order.status.toLowerCase()}</strong>
          {order.fillPriceCents?<small>{money(order.fillPriceCents)} filled</small>:null}
          {order.failureReason?<small>{order.failureReason}</small>:null}
          {order.status==='PENDING' && <button type="button" disabled={canceling===order.id} onClick={()=>onCancel(order.id)} className="small-action"><X size={14}/>{canceling===order.id?'Canceling…':'Cancel'}</button>}
        </div>
      </div>)}</div>}/>
    <p className="gameplay-hint orders-foot">Funds and shares checked at execution.</p>
  </section>;
}
