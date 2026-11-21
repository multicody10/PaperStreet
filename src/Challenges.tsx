import { useMemo, useState } from 'react';
import { Activity, Award, BarChart3, Check, CheckCircle2, ChevronRight, CircleDot, Clock3, Compass, Layers, Target, TrendingUp, Trophy, X } from 'lucide-react';
import { STARTING_CASH_CENTS, type Portfolio } from '../shared/stocks';
import type { Achievement, AchievementCode, QueuedOrder } from '../shared/gameplay';
import { FitPager, SectionTabs } from './FitPager';
import { money } from './PriceChart';

export type GoalCategory='all'|'trading'|'forecasting'|'portfolio';
export type GoalSort='progress'|'recent'|'name';
export const achievementCategory=(code:AchievementCode):Exclude<GoalCategory,'all'>=>
  code==='five_assets'?'portfolio':
  code==='first_prediction'||code==='ten_predictions'||code==='three_correct'?'forecasting':'trading';
export const goalProgress=(a:Achievement)=>a.unlockedAt!==null?100:
  Math.max(0,Math.min(100,Math.round(a.progress/Math.max(1,a.target)*100)));
export const achievementCounts=(achievements:readonly Achievement[])=>{
  const completed=achievements.filter(a=>a.unlockedAt!==null).length;
  const inProgress=achievements.filter(a=>a.unlockedAt===null&&a.progress>0).length;
  return {total:achievements.length,completed,inProgress,notStarted:achievements.length-completed-inProgress,
    percent:achievements.length?Math.round(completed/achievements.length*100):0};
};
export const sortGoals=(achievements:readonly Achievement[],category:GoalCategory,sort:GoalSort):Achievement[] =>
  achievements.filter(a=>category==='all'||achievementCategory(a.code)===category)
    .sort((a,b)=>sort==='name'?a.title.localeCompare(b.title):
      sort==='recent'?(b.unlockedAt??0)-(a.unlockedAt??0)||goalProgress(b)-goalProgress(a):
      goalProgress(b)-goalProgress(a)||a.title.localeCompare(b.title));
const categoryName=(category:Exclude<GoalCategory,'all'>)=>
  category==='trading'?'Trading':category==='forecasting'?'Forecasts':'Portfolio';
const formatDay=(seconds:number)=>new Date(seconds*1000).toLocaleDateString(undefined,{month:'short',day:'numeric'});
function GoalIcon({code,size=20}:{code:AchievementCode;size?:number}){
  switch(code){
    case 'first_trade':case 'five_trades':case 'twenty_five_trades':return <BarChart3 size={size}/>;
    case 'first_prediction':case 'ten_predictions':return <Target size={size}/>;
    case 'three_correct':return <Trophy size={size}/>;
    case 'five_assets':return <Layers size={size}/>;
  }
}
export function Challenges({achievements,portfolio}:{achievements:Achievement[];portfolio:Portfolio|null}){
  const [category,setCategory]=useState<GoalCategory>('all');
  const [sort,setSort]=useState<GoalSort>('progress');
  const [mobilePane,setMobilePane]=useState<'featured'|'all'|'insights'>('featured');
  const counts=achievementCounts(achievements);
  const all=useMemo(()=>sortGoals(achievements,category,sort),[achievements,category,sort]);
  const featured=useMemo(()=>sortGoals(achievements,'all','progress').slice(0,4),[achievements]);
  const recent=useMemo(()=>achievements.filter(a=>a.unlockedAt!==null)
    .sort((a,b)=>(b.unlockedAt??0)-(a.unlockedAt??0)).slice(0,3),[achievements]);
  const initial=portfolio?.startingCashCents??STARTING_CASH_CENTS;
  const equity=portfolio?.equityCents??initial;
  const target=Math.round(initial*1.1);
  const gain=equity-initial;
  const growth=initial?gain/initial*100:0;
  const goalPercent=Math.max(0,Math.min(100,Math.round(gain/Math.max(1,target-initial)*100)));
  const switchCategory=(next:GoalCategory)=>{
    setCategory(next);
    if(window.matchMedia('(max-width:760px)').matches)setMobilePane('all');
  };
  return <div className="goals-terminal" data-mobile-pane={mobilePane} aria-label="Goals and achievements">
    <div className="goals-title"><div className="goals-title-icon"><Target size={25}/></div>
      <div><h1>Goals</h1><p>Track achievements, milestones, and trading progress.</p></div></div>
    <div className="goals-stats">
      <div className="panel goals-stat"><Award className="goals-stat-icon" size={24}/>
        <span>Total achievements</span><strong>{counts.total}</strong><small>Available objectives</small></div>
      <div className="panel goals-stat"><CircleDot className="goals-stat-icon" size={24}/>
        <span>In progress</span><strong>{counts.inProgress}</strong><small>{counts.total?Math.round(counts.inProgress/counts.total*100):0}% of total</small></div>
      <div className="panel goals-stat"><CheckCircle2 className="goals-stat-icon success" size={24}/>
        <span>Completed</span><strong>{counts.completed}</strong><small>{counts.percent}% of total</small></div>
      <div className="panel goals-stat"><Layers className="goals-stat-icon" size={24}/>
        <span>Completion</span><strong>{counts.percent}%</strong>
        <div className="goals-stat-meter"><i style={{width:counts.percent+'%'}}/></div></div>
      <div className="panel goals-stat"><TrendingUp className="goals-stat-icon success" size={24}/>
        <span>Account return</span><strong className={gain>=0?'positive':'negative'}>{portfolio?(growth>0?'+':'')+growth.toFixed(2)+'%':'—'}</strong>
        <small>{portfolio?money(gain)+' from start':'Portfolio unavailable'}</small></div>
    </div>
    <section className="panel goals-primary">
      <div className="goals-primary-identity"><Target size={29}/>
        <div><small>Primary milestone</small><strong>Grow account to {money(target)}</strong>
          <span>Achieve a 10% return on your paper portfolio.</span></div></div>
      <div className="goals-primary-progress">
        <strong>{goalPercent}% complete</strong>
        <div className="goals-progress-track"><i style={{width:goalPercent+'%'}}/></div>
        <div><span>{portfolio?money(equity):'—'} / {money(target)}</span><span>{money(Math.max(0,target-equity))} to go</span></div>
      </div>
    </section>
    <div className="goals-filterbar">
      <div className="goals-category-tabs" role="group" aria-label="Goal categories">
        {([{id:'all',title:'All',icon:<Compass size={15}/>},
          {id:'trading',title:'Trading',icon:<Activity size={15}/>},
          {id:'forecasting',title:'Forecasts',icon:<Target size={15}/>},
          {id:'portfolio',title:'Portfolio',icon:<Layers size={15}/>} ] as const).map(item=>
          <button type="button" key={item.id} className={category===item.id?'active':''}
            aria-pressed={category===item.id} onClick={()=>switchCategory(item.id)}>{item.icon}{item.title}</button>)}
      </div>
      <label className="goals-sort-label">Sort
        <select aria-label="Sort achievements" value={sort} onChange={event=>setSort(event.target.value as GoalSort)}>
          <option value="progress">Progress</option><option value="recent">Recent unlocks</option><option value="name">Name</option>
        </select>
      </label>
    </div>
    <SectionTabs items={[{id:'featured',label:'Featured'},{id:'all',label:'All goals'},{id:'insights',label:'Overview'}]}
      value={mobilePane} onChange={setMobilePane} label="Goals panels"/>
    <div className="goals-body">
      <section className="panel goals-featured">
        <div className="goals-panel-heading"><h2><Award size={19}/> Featured achievements</h2><span>{featured.length} highlighted</span></div>
        <div className="goals-featured-grid">{featured.length?featured.map(a=><div key={a.code}
          className={'goals-feature '+(a.unlockedAt?'unlocked':'')+' category-'+achievementCategory(a.code)}>
          <div className="goals-feature-symbol"><GoalIcon code={a.code} size={30}/></div>
          <div className="goals-feature-details"><strong>{a.title}</strong><p>{a.description}</p></div>
          <div className="goals-feature-footer">
            <span>{categoryName(achievementCategory(a.code))}</span>
            {a.unlockedAt?<b><CheckCircle2 size={14}/> Completed</b>:<b>{a.progress} / {a.target}</b>}
          </div>
          <div className="goals-feature-track"><i style={{width:goalProgress(a)+'%'}}/></div>
        </div>):<div className="rail-empty">Achievements unavailable.</div>}</div>
      </section>
      <section className="panel goals-completion">
        <div className="goals-panel-heading"><h2><BarChart3 size={19}/> Completion overview</h2></div>
        <div className="goals-completion-body">
          <div className="goals-completion-ring" style={{background:'conic-gradient(#21c4f6 0 '+counts.percent+'%,#566982 '+counts.percent+'% 100%)'}}>
            <span><strong>{counts.percent}%</strong><small>Complete</small></span>
          </div>
          <div className="goals-completion-legend">
            {([{name:'Completed',count:counts.completed,cls:'done'},
              {name:'In progress',count:counts.inProgress,cls:'doing'},
              {name:'Not started',count:counts.notStarted,cls:'idle'}] as const)
              .map(v=><div key={v.name}><i className={v.cls}/><span>{v.name}</span><strong>{v.count}</strong></div>)}
            <p>{counts.total} total goals</p>
          </div>
        </div>
      </section>
      <section className="panel goals-all">
        <div className="goals-panel-heading"><h2><Trophy size={19}/> All achievements</h2><span>{all.length} shown</span></div>
        <div className="goals-table-head"><span>Achievement</span><span>Status</span><span>Category</span><span>Progress</span></div>
        <FitPager key={category+':'+sort} items={all} rowHeight={41} compactRowHeight={44} empty="No achievements in this category."
          render={items=><div className="goals-table-body">{items.map(a=><div key={a.code} className="goals-table-row">
            <span className="goals-table-name"><i><GoalIcon code={a.code} size={16}/></i><strong>{a.title}</strong></span>
            <span className={'goals-status '+(a.unlockedAt?'completed':a.progress?'progress':'not-started')}>
              {a.unlockedAt?<Check size={13}/>:a.progress?<CircleDot size={13}/>:<Clock3 size={13}/>}
              {a.unlockedAt?'Completed':a.progress?'In progress':'Not started'}
            </span>
            <span className="goals-category-tag">{categoryName(achievementCategory(a.code))}</span>
            <span className="goals-table-progress"><b>{goalProgress(a)}%</b><i><em style={{width:goalProgress(a)+'%'}}/></i></span>
          </div>)}</div>}/>
      </section>
      <section className="panel goals-unlocks">
        <div className="goals-panel-heading"><h2><Trophy size={19}/> Recent unlocks</h2></div>
        <div className="goals-unlocks-body">
          {recent.length?recent.map(a=><div key={a.code} className={'goals-unlock-badge category-'+achievementCategory(a.code)}>
            <div className="goals-unlock-emblem"><GoalIcon code={a.code} size={24}/></div>
            <strong>{a.title}</strong><span>{a.unlockedAt?formatDay(a.unlockedAt):''}</span>
          </div>):<div className="rail-empty">Complete goals to earn badges.</div>}
        </div>
        <button className="goals-unlocks-view" type="button" onClick={()=>{setCategory('all');setSort('recent');setMobilePane('all')}}>
          View achievement history <ChevronRight size={14}/>
        </button>
      </section>
    </div>
  </div>;
}

const formatTime=(seconds:number)=>new Date(seconds*1000).toLocaleString();
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
