import { useState } from 'react';
import { Award, CheckCircle2, Clock3, X } from 'lucide-react';
import type { Quote, SymbolCode } from '../shared/stocks';
import type { Achievement, QueuedOrder } from '../shared/gameplay';
import { FitPager, SectionTabs } from './FitPager';
import { money } from './PriceChart';

const formatTime=(seconds:number)=>new Date(seconds*1000).toLocaleString();
const sections=[{id:'badges',label:'Achievements'},{id:'stocks',label:'Stocks'}] as const;
type GoalsTab=typeof sections[number]['id'];

export function Challenges({quotes,achievements,openStock}:{
  quotes:Quote[];achievements:Achievement[];openStock:(symbol:SymbolCode)=>void;
}) {
  const [tab,setTab]=useState<GoalsTab>('badges');
  return <div className="challenge-layout fitted-panel" data-pane={tab}>
    <SectionTabs items={sections} value={tab} onChange={setTab} label="Goals sections"/>
    <section className="panel achievement-panel">
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
    </section>
    <section className="panel challenge-explore">
      <div className="panel-heading"><h2>Browse stocks</h2></div>
      <FitPager items={quotes} rowHeight={60} compactRowHeight={65} empty="Market data unavailable."
        render={items=><div className="challenge-stocks">{items.map(q=><button key={q.symbol} type="button" onClick={()=>openStock(q.symbol)}>
          <span><strong>{q.symbol}</strong><small>{q.name}</small></span><strong>{money(q.priceCents)}</strong>
        </button>)}</div>}/>
    </section>
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
