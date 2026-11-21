import { useState, type ReactNode } from 'react';
import { Activity, ArrowDownLeft, ArrowRight, BarChart3, BriefcaseBusiness, CheckCircle2, ChevronRight, Target, Wallet, Zap } from 'lucide-react';
import { STARTING_CASH_CENTS, STOCKS, type ChartHistory, type HistoryRange, type Portfolio, type Quote, type SymbolCode, type Trade } from '../shared/stocks';
import type { Achievement, OrderKind } from '../shared/gameplay';
import { FitPager, SectionTabs } from './FitPager';
import { money, PriceChart } from './PriceChart';

export type DashboardProps = {
  portfolio:Portfolio|null;quotes:Quote[];trades:Trade[];achievements:Achievement[];
  selectedSymbol:SymbolCode;setSelectedSymbol:(symbol:SymbolCode)=>void;
  onOpenStock:(symbol:SymbolCode)=>void;onNavigate:(page:'portfolio'|'history'|'challenges'|'trade')=>void;
  selected?:Quote;history?:ChartHistory;historyError?:string;
  range:HistoryRange;setRange:(range:HistoryRange)=>void;
  side:'BUY'|'SELL';setSide:(side:'BUY'|'SELL')=>void;
  shares:string;setShares:(shares:string)=>void;
  orderKind:'IMMEDIATE'|OrderKind;setOrderKind:(kind:'AUTO'|'IMMEDIATE'|OrderKind)=>void;
  triggerPrice:string;setTriggerPrice:(value:string)=>void;
  total:number;canSubmit:boolean;pending:boolean;execute:()=>void;
};
const percentage = (x:number)=>`${x>0?'+':''}${x.toFixed(2)}%`;
const DAY_COLORS=['#18b9ff','#967cff','#41d49b','#f6b85c','#fb7193','#94b5f4'];

function DashCard({className='',title,icon,action,children}:{
  className?:string;title:string;icon:ReactNode;action?:ReactNode;children:ReactNode;
}) {
  return <section className={'panel terminal-card '+className}>
    <div className="terminal-card-heading"><div className="terminal-card-title">{icon}<h2>{title}</h2></div>{action}</div>
    {children}
  </section>;
}

function Allocation({portfolio}:{portfolio:Portfolio|null}) {
  const total=portfolio?.equityCents??0;
  const invested=portfolio?.investedCents??0;
  const positions=[...(portfolio?.positions??[])].sort((a,b)=>b.marketValueCents-a.marketValueCents);
  const groups=[...positions.slice(0,3).map(p=>({label:p.symbol,cents:p.marketValueCents})),
    ...(positions.length>3?[{label:'Other',cents:positions.slice(3).reduce((n,p)=>n+p.marketValueCents,0)}]:[]),
    {label:'Cash',cents:portfolio?.cashCents??0}];
  const safe=Math.max(total,1);
  let angle=0;
  const colors=groups.map((group,i)=>({ ...group,color:group.label==='Cash'?'#53637f':DAY_COLORS[i%DAY_COLORS.length],
    percent:Math.max(0,group.cents)/safe*100 }));
  const stops=colors.map(g=>{const from=angle;angle+=g.percent;return `${g.color} ${from.toFixed(2)}% ${angle.toFixed(2)}%`});
  if(angle<100)stops.push(`#53637f ${angle.toFixed(2)}% 100%`);
  return <div className="terminal-allocation">
    <div className="terminal-donut" aria-label={'Invested '+money(invested)+' of '+money(total)}
      style={{background:'conic-gradient('+stops.join(',')+')'}}>
      <span><strong>{money(invested)}</strong><small>Invested</small></span>
    </div>
    <div className="terminal-legend">
      {colors.map(g=><div key={g.label}><span className="terminal-swatch" style={{background:g.color}}/>
        <span>{g.label}</span><strong>{g.percent.toFixed(1)}%</strong></div>)}
    </div>
  </div>;
}

function DashTicket({selected,side,setSide,shares,setShares,orderKind,setOrderKind,triggerPrice,setTriggerPrice,total,canSubmit,pending,execute}:Pick<DashboardProps,
  'selected'|'side'|'setSide'|'shares'|'setShares'|'orderKind'|'setOrderKind'|'triggerPrice'|'setTriggerPrice'|'total'|'canSubmit'|'pending'|'execute'>) {
  const queue=orderKind!=='IMMEDIATE';
  const kind: 'IMMEDIATE'|OrderKind=orderKind;
  return <div className="terminal-ticket">
    <div className="terminal-ticket-side side-selector">
      <button type="button" className={side==='BUY'?'current buy':''} onClick={()=>setSide('BUY')} aria-pressed={side==='BUY'}>Buy</button>
      <button type="button" className={side==='SELL'?'current sell':''} onClick={()=>setSide('SELL')} aria-pressed={side==='SELL'}>Sell</button>
    </div>
    <div className="terminal-ticket-field">
      <label htmlFor="dash-order-symbol">Symbol</label>
      <div className="terminal-ticket-symbol" id="dash-order-symbol"><strong>{selected?.symbol??'—'}</strong><span>{selected?.name??'Select a stock'}</span></div>
    </div>
    <div className="terminal-ticket-field">
      <label htmlFor="dash-order-shares">Quantity</label>
      <input type="number" id="dash-order-shares" min="1" step="1" max="100000" value={shares}
        onChange={event=>setShares(event.target.value)} inputMode="numeric"/>
    </div>
    <div className="terminal-ticket-field">
      <label>Order type</label>
      <div className="terminal-order-types" role="group" aria-label="Order type">
        {(['MARKET','LIMIT','STOP'] as const).map(k=>{
          const active=k==='MARKET'?(kind==='IMMEDIATE'||kind==='MARKET'):kind===k;
          return <button type="button" key={k} className={active?'active':''} aria-pressed={active} onClick={()=>{
            setOrderKind(k==='MARKET'?(selected?.marketOpen?'IMMEDIATE':'MARKET'):k);
          }}>{k==='MARKET'?'Market':k==='LIMIT'?'Limit':'Stop'}</button>;
        })}
      </div>
    </div>
    {(orderKind==='LIMIT'||orderKind==='STOP')&&<div className="terminal-ticket-field">
      <label htmlFor="dash-order-trigger">{orderKind==='LIMIT'?'Limit price':'Stop price'}</label>
      <input id="dash-order-trigger" type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="0.00"
        value={triggerPrice} onChange={event=>setTriggerPrice(event.target.value)}/>
    </div>}
    <div className="terminal-ticket-total"><span>{queue?'Indicative value':'Estimated total'} (Paper)</span><strong>{money(total)}</strong></div>
    <button type="button" className={'execute-button '+side.toLowerCase()} disabled={!canSubmit||pending} onClick={execute}>
      {pending?'Processing…':(queue?'Queue ':'Submit ')+(side==='BUY'?'Buy':'Sell')+' Order (Paper)'}
    </button>
    <div className="terminal-ticket-foot">{selected?.stale?'Updated quote required.':queue?'Executes against fresh quotes during market hours.':'Virtual trades only. No real money.'}</div>
  </div>;
}

export function TradingDashboard(p:DashboardProps) {
  const [section,setSection]=useState<'market'|'ticket'|'positions'|'activity'>('market');
  const selected=p.selected;
  const initial=p.portfolio?.startingCashCents??STARTING_CASH_CENTS;
  const equity=p.portfolio?.equityCents??initial;
  const goal=Math.round(initial*1.1);
  const goalProgress=Math.max(0,Math.min(100,(equity-initial)/Math.max(1,goal-initial)*100));
  const change=equity-initial;
  const changePercent=initial?change/initial*100:0;
  const sortedQuotes=STOCKS.map(stock=>p.quotes.find(q=>q.symbol===stock.symbol)).filter((q):q is Quote=>!!q);
  const openPositions=p.portfolio?.positions??[];
  const activeAchievements=p.achievements.slice(0,8);
  return <div className="terminal-dashboard" aria-label="Trading dashboard">
    <div className="terminal-summary">
      <div className="panel terminal-summary-card terminal-equity">
        <span className="terminal-kicker"><Wallet size={17}/> Portfolio (Paper)</span>
        <strong className="terminal-big-number">{p.portfolio?money(equity):'—'}</strong>
        <span className={'terminal-performance '+(change>=0?'positive':'negative')}>{p.portfolio?money(change):'—'} <b>{p.portfolio?percentage(changePercent):''}</b><small>All time</small></span>
        <div className="terminal-graphic" aria-hidden="true"><i/><i/><i/><i/><i/><i/></div>
      </div>
      <div className="panel terminal-summary-card terminal-goal">
        <span className="terminal-kicker"><Target size={18}/> Equity milestone</span>
        <div className="terminal-goal-content"><strong>Grow to {money(goal)}</strong><span>{Math.round(goalProgress)}%</span></div>
        <div className="terminal-progress"><span style={{width:goalProgress+'%'}}/></div>
        <span className="terminal-muted">{p.portfolio?money(equity):'—'} / {money(goal)} · 10% return target</span>
      </div>
      <div className="panel terminal-summary-card terminal-count">
        <span className="terminal-kicker"><Zap size={18}/> Recent trades</span>
        <strong className="terminal-big-number">{p.trades.length}</strong>
        <span className="terminal-muted">Recorded fills in recent history</span>
      </div>
    </div>
    <SectionTabs value={section} onChange={setSection} label="Dashboard sections"
      items={[{id:'market',label:'Market'},{id:'ticket',label:'Order'},{id:'positions',label:'Portfolio'},{id:'activity',label:'Activity'}]}/>
    <div className="terminal-middle" data-section={section}>
      <DashCard className="terminal-watch" title="Market watch" icon={<BarChart3 size={18}/>}
        action={<button className="terminal-more" type="button" onClick={()=>p.onNavigate('trade')}>All stocks <ChevronRight size={14}/></button>}>
        <div className="terminal-watch-head"><span>Symbol</span><span>Last</span><span>Change</span></div>
        <FitPager items={sortedQuotes} rowHeight={46} compactRowHeight={43} empty="Quotes unavailable"
          render={items=><div className="terminal-watch-list">
            {items.map(q=><button key={q.symbol} type="button" className={'terminal-watch-row '+(selected?.symbol===q.symbol?'selected':'')}
              onClick={()=>{p.setSelectedSymbol(q.symbol);if(window.matchMedia('(max-width:760px)').matches)setSection('ticket')}} aria-pressed={selected?.symbol===q.symbol}>
              <span className="terminal-market-symbol"><i>{q.symbol.slice(0,2)}</i><strong>{q.symbol}</strong></span>
              <span className="terminal-quote">{money(q.priceCents)}</span>
              <span className={'terminal-quote-change '+(q.changePct>=0?'up':'down')}>{percentage(q.changePct)}</span>
            </button>)}
          </div>}/>
      </DashCard>
      <section className="panel terminal-chart-panel">
        <div className="terminal-chart-header">
          <div className="terminal-chart-identity"><span className="terminal-stock-logo">{selected?.symbol.slice(0,1)??'S'}</span>
            <strong>{selected?.symbol??'—'}</strong><small>{selected?.name??'Select a stock'}</small></div>
          <div className="terminal-chart-quote">
            <strong>{selected?money(selected.priceCents):'—'}</strong>
            <span className={selected&&selected.changePct<0?'negative':'positive'}>{selected?percentage(selected.changePct):'—'}</span>
          </div>
          <button type="button" className="terminal-details-link" onClick={()=>p.onOpenStock(p.selectedSymbol)} title="Open stock details">
            <ArrowRight size={17}/>
          </button>
        </div>
        <div className="chart-range-bar" role="group" aria-label="Chart history range">
          {(['1D','1W','1M','3M','1Y','ALL'] as HistoryRange[]).map(range=><button key={range} type="button"
            className={p.range===range?'active':''} aria-pressed={p.range===range} onClick={()=>p.setRange(range)}>{range}</button>)}
        </div>
        <PriceChart key={p.selectedSymbol+':'+p.range} history={p.history} quote={selected} range={p.range} error={p.historyError}/>
      </section>
      <DashCard className="terminal-order" title="Order entry" icon={<ArrowDownLeft size={18}/>}
        action={<button className="terminal-more" type="button" onClick={()=>p.onOpenStock(p.selectedSymbol)}>Full ticket <ChevronRight size={14}/></button>}>
        <DashTicket selected={selected} side={p.side} setSide={p.setSide} shares={p.shares} setShares={p.setShares}
          orderKind={p.orderKind} setOrderKind={p.setOrderKind} triggerPrice={p.triggerPrice} setTriggerPrice={p.setTriggerPrice}
          total={p.total} canSubmit={p.canSubmit} pending={p.pending} execute={p.execute}/>
      </DashCard>
    </div>
    <div className="terminal-lower" data-section={section}>
      <DashCard className="terminal-bottom-goals" title="Goals & achievements" icon={<Target size={18}/>}
        action={<button className="terminal-more" type="button" onClick={()=>p.onNavigate('challenges')}>View all <ChevronRight size={14}/></button>}>
        <FitPager items={activeAchievements} rowHeight={45} compactRowHeight={50} empty="No achievements yet"
          render={items=><div className="terminal-goals-list">{items.map(a=><div key={a.code} className={'terminal-goal-row '+(a.unlockedAt?'complete':'')}>
            <span className="terminal-goal-icon">{a.unlockedAt?<CheckCircle2 size={15}/>:<Target size={14}/>}</span>
            <span className="terminal-goal-desc"><strong>{a.title}</strong><i><b style={{width:Math.min(100,a.progress/Math.max(1,a.target)*100)+'%'}}/></i></span>
            <small>{a.progress}/{a.target}</small>
          </div>)}</div>}/>
      </DashCard>
      <DashCard className="terminal-bottom-positions" title={'Open positions ('+openPositions.length+')'} icon={<BriefcaseBusiness size={18}/>}
        action={<button className="terminal-more" type="button" onClick={()=>p.onNavigate('portfolio')}>Portfolio <ChevronRight size={14}/></button>}>
        <div className="terminal-position-head"><span>Symbol</span><span>Qty</span><span>Last</span><span>P/L</span></div>
        <FitPager items={openPositions} rowHeight={40} compactRowHeight={43} empty="No open positions"
          render={items=><div className="terminal-position-list">{items.map(pos=><div key={pos.symbol} className="terminal-position-row">
            <strong>{pos.symbol}</strong><span>{pos.shares}</span><span>{money(pos.quote.priceCents)}</span>
            <strong className={pos.profitCents>=0?'positive':'negative'}>{money(pos.profitCents)}</strong>
          </div>)}</div>}/>
      </DashCard>
      <DashCard className="terminal-bottom-activity" title="Recent paper trades" icon={<Activity size={18}/>}
        action={<button className="terminal-more" type="button" onClick={()=>p.onNavigate('history')}>History <ChevronRight size={14}/></button>}>
        <div className="terminal-trades-head"><span>Time</span><span>Symbol</span><span>Side</span><span>Qty</span></div>
        <FitPager items={p.trades} rowHeight={40} compactRowHeight={43} empty="No completed trades"
          render={items=><div className="terminal-trades-list">{items.map(t=><div className="terminal-trades-row" key={t.id}>
            <span>{new Date(t.executedAt*1000).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>
            <strong>{t.symbol}</strong><b className={t.side==='BUY'?'buy':'sell'}>{t.side==='BUY'?'Buy':'Sell'}</b><span>{t.shares}</span>
          </div>)}</div>}/>
      </DashCard>
      <DashCard className="terminal-bottom-allocation" title="Allocation & insights" icon={<BarChart3 size={18}/>}>
        <Allocation portfolio={p.portfolio}/>
      </DashCard>
    </div>
  </div>;
}
