import { ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, BarChart3, BriefcaseBusiness, ChevronRight, Clock3, Crosshair, Layers, TrendingDown, TrendingUp } from 'lucide-react';
import { HISTORY_RANGES, type ChartHistory, type HistoryRange, type Portfolio, type Position, type Quote, type SymbolCode, type Trade } from '../shared/stocks';
import type { OrderKind, Prediction, PredictionDirection } from '../shared/gameplay';
import { FitPager, SectionTabs } from './FitPager';
import { money, PriceChart } from './PriceChart';
import { StockPredictions } from './StockPredictions';
import { STOCK_PROFILES } from './stockProfiles';

export type StockPane = 'chart'|'order'|'facts'|'predict';
export type StockTerminalProps = {
  symbol:SymbolCode;quote?:Quote;quotes:Quote[];portfolio:Portfolio|null;trades:Trade[];
  history?:ChartHistory;historyError?:string;range:HistoryRange;setRange:(v:HistoryRange)=>void;
  pane:StockPane;setPane:(v:StockPane)=>void;onBack:()=>void;openStock:(s:SymbolCode)=>void;openPortfolio:()=>void;
  side:'BUY'|'SELL';setSide:(v:'BUY'|'SELL')=>void;
  shares:string;setShares:(v:string)=>void;orderKind:'IMMEDIATE'|OrderKind;setOrderKind:(v:'AUTO'|'IMMEDIATE'|OrderKind)=>void;
  triggerPrice:string;setTriggerPrice:(v:string)=>void;total:number;canSubmit:boolean;pending:boolean;execute:()=>void;
  predictions:Prediction[];forecastPending:boolean;submitForecast:(s:SymbolCode,d:PredictionDirection)=>void;
};
const signedPercent=(value:number)=>(value>0?'+':'')+value.toFixed(2)+'%';
const signedMoney=(cents:number)=>(cents>0?'+':cents<0?'−':'')+money(Math.abs(cents));
const available=(value:number|undefined)=>value===undefined?'—':money(value);

function StockOrderTicket(p:Pick<StockTerminalProps,
  'symbol'|'quote'|'portfolio'|'side'|'setSide'|'shares'|'setShares'|'orderKind'|'setOrderKind'|
  'triggerPrice'|'setTriggerPrice'|'total'|'canSubmit'|'pending'|'execute'|'openPortfolio'>) {
  const queued=p.orderKind!=='IMMEDIATE';
  const held=p.portfolio?.positions.find(pos=>pos.symbol===p.symbol)?.shares??0;
  const max=p.side==='BUY'&&p.quote?
    Math.min(100000,Math.floor((p.portfolio?.cashCents??0)/Math.max(1,p.quote.priceCents))):
    Math.min(100000,held);
  const marketValue=p.quote?.marketOpen?'IMMEDIATE':'MARKET';
  return <section className="panel stock-terminal-ticket" aria-label={'Trade '+p.symbol}>
    <div className="stock-ticket-tabs side-selector" role="group" aria-label="Trade direction">
      <button className={p.side==='BUY'?'current buy':''} type="button" aria-pressed={p.side==='BUY'} onClick={()=>p.setSide('BUY')}>Buy</button>
      <button className={p.side==='SELL'?'current sell':''} type="button" aria-pressed={p.side==='SELL'} onClick={()=>p.setSide('SELL')}>Sell</button>
    </div>
    <div className="stock-ticket-body">
      <div className="stock-ticket-field">
        <label htmlFor="stock-ticket-kind">Order type</label>
        <select id="stock-ticket-kind" className="stock-ticket-control" value={p.orderKind} onChange={e=>p.setOrderKind(e.target.value as 'IMMEDIATE'|OrderKind)}>
          <option value={marketValue}>{p.quote?.marketOpen?'Market · Immediate':'Market · Queued'}</option>
          <option value="LIMIT">Limit · Queued</option>
          <option value="STOP">Stop · Queued</option>
        </select>
      </div>
      {(p.orderKind==='LIMIT'||p.orderKind==='STOP')&&<div className="stock-ticket-field">
        <label htmlFor="stock-ticket-trigger">{p.orderKind==='LIMIT'?'Limit price':'Stop price'} (USD)</label>
        <input className="stock-ticket-control" id="stock-ticket-trigger" type="number" min=".01" step=".01" inputMode="decimal" placeholder="0.00"
          value={p.triggerPrice} onChange={e=>p.setTriggerPrice(e.target.value)}/>
      </div>}
      <div className="stock-ticket-field">
        <label htmlFor="stock-ticket-quantity">Quantity <small>Max currently {max}</small></label>
        <div className="stock-ticket-quantity">
          <input id="stock-ticket-quantity" type="number" min="1" max="100000" step="1" inputMode="numeric" value={p.shares}
            onChange={e=>p.setShares(e.target.value)}/><span>shares</span>
        </div>
      </div>
      <div className="stock-ticket-presets" role="group" aria-label="Quantity presets">
        {[1,10,100].map(qty=><button key={qty} type="button" onClick={()=>p.setShares(String(qty))}
          aria-pressed={p.shares===String(qty)}>{qty.toLocaleString('en-US')}</button>)}
        <button type="button" disabled={max<1} aria-pressed={p.shares===String(max)} onClick={()=>p.setShares(String(max))}>Max</button>
      </div>
      <div className="stock-ticket-balance"><span>{p.side==='BUY'?'Available paper cash':'Available shares'}</span>
        <strong>{p.side==='BUY'?money(p.portfolio?.cashCents??0):held.toLocaleString('en-US')}</strong></div>
      <div className="stock-ticket-total"><span>{queued?'Indicative value':'Estimated '+(p.side==='BUY'?'cost':'proceeds')}</span><strong>{money(p.total)}</strong></div>
      <button type="button" className={'execute-button '+p.side.toLowerCase()} disabled={!p.canSubmit||p.pending} onClick={p.execute}>
        {p.pending?'Processing…':(queued?'Queue ':'')+(p.side==='BUY'?'Buy ':'Sell ')+p.symbol}
      </button>
      <p className="stock-ticket-note">{queued?'Queued orders execute with verified prices when market conditions permit.':'Simulated trade using verified market quotes.'}</p>
      <button type="button" className="stock-ticket-orders-link" onClick={p.openPortfolio}>Queued orders <ChevronRight size={13}/></button>
    </div>
  </section>;
}

function RelatedStocks({symbol,quotes,openStock}:{symbol:SymbolCode;quotes:Quote[];openStock:(s:SymbolCode)=>void}){
  const rows=STOCK_PROFILES[symbol].peers.map(s=>quotes.find(q=>q.symbol===s)).filter((q):q is Quote=>!!q);
  return <section className="panel stock-terminal-related">
    <div className="stock-terminal-heading"><h2><Layers size={17}/> Related stocks</h2></div>
    <FitPager items={rows} rowHeight={43} compactRowHeight={42} empty="Related quotes unavailable"
      render={items=><div className="stock-terminal-related-list">{items.map(q=><button type="button"
        key={q.symbol} className="stock-terminal-related-row" onClick={()=>openStock(q.symbol)}>
        <span className="stock-terminal-peer-badge">{q.symbol.slice(0,2)}</span><strong>{q.symbol}</strong>
        <span>{money(q.priceCents)}</span>
        <b className={q.changePct>=0?'positive':'negative'}>{signedPercent(q.changePct)}</b>
        <ChevronRight size={13}/>
      </button>)}</div>}/>
  </section>;
}

function StockActivity({symbol,trades}:{symbol:SymbolCode;trades:Trade[]}){
  const selected=trades.filter(t=>t.symbol===symbol).sort((a,b)=>b.executedAt-a.executedAt||b.id-a.id);
  return <section className="panel stock-terminal-activity">
    <div className="stock-terminal-heading"><h2><Clock3 size={17}/> Your {symbol} trades</h2><span>{selected.length} fills</span></div>
    <FitPager items={selected} rowHeight={43} compactRowHeight={44} empty={'No '+symbol+' trades yet'}
      render={items=><div className="stock-terminal-activity-list">{items.map(t=><div className="stock-terminal-activity-row" key={t.id}>
        <span className={t.side==='BUY'?'buy':'sell'}>{t.side==='BUY'?<ArrowDownLeft size={14}/>:<ArrowUpRight size={14}/>}</span>
        <div><strong>{t.side} {t.shares} shares</strong><small>{new Date(t.executedAt*1000).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</small></div>
        <b>{money(t.priceCents)}</b>
      </div>)}</div>}/>
  </section>;
}

function StockMetrics({quote,position,portfolio}:{quote?:Quote;position?:Position;portfolio:Portfolio|null}){
  const rows=[
    ['Prev. close',available(quote?.previousCloseCents)],
    ['Session open',available(quote?.sessionBar?.openCents)],
    ['Day high',available(quote?.sessionBar?.highCents)],
    ['Day low',available(quote?.sessionBar?.lowCents)],
    ['Shares held',String(position?.shares??0)],
    ['Position value',available(position?.marketValueCents)],
    ['Unrealized P/L',position?signedMoney(position.profitCents):'—'],
    ['Paper cash',portfolio?money(portfolio.cashCents):'—'],
  ];
  return <section className="panel stock-terminal-metrics" aria-label="Stock quote and position metrics">
    <div className="stock-terminal-heading"><h2><BarChart3 size={17}/> Key metrics</h2></div>
    <div className="stock-terminal-metrics-grid">{rows.map(([label,value])=><div className="stock-terminal-metric" key={label}>
      <span>{label}</span><strong className={label==='Unrealized P/L'&&position?(position.profitCents>=0?'positive':'negative'):''}>{value}</strong>
    </div>)}</div>
  </section>;
}
export function StockTerminal(p:StockTerminalProps){
  const profile=STOCK_PROFILES[p.symbol];
  const position=p.portfolio?.positions.find(v=>v.symbol===p.symbol);
  const change=p.quote?p.quote.priceCents-p.quote.previousCloseCents:0;
  return <div className="stock-terminal" data-pane={p.pane} aria-label={'Stock details and trading for '+p.symbol}>
    <div className="stock-terminal-breadcrumb">
      <button type="button" onClick={p.onBack}><ArrowLeft size={16}/> Trade</button>
      <ChevronRight size={13}/><strong>{p.symbol}</strong>
    </div>
    <header className="stock-terminal-hero">
      <div className="stock-terminal-hero-title">
        <span className="stock-terminal-logo">{p.symbol.slice(0,2)}</span>
        <div className="stock-terminal-name">
          <div className="stock-terminal-name-row">
            <h1 title={profile.companyName}>{profile.companyName}</h1>
            <span className="stock-terminal-symbol" aria-label={'Ticker '+p.symbol}>{p.symbol}</span>
          </div>
          <p title={profile.sector}>{profile.sector}</p>
        </div>
        <button type="button" className="stock-terminal-hero-action" onClick={()=>p.setPane('order')}>
          <ArrowRight size={17}/> Trade {p.symbol}
        </button>
      </div>
      <div className="stock-terminal-quote-summary">
        <div className="stock-terminal-price"><strong>{p.quote?money(p.quote.priceCents):'—'}</strong>
          <b className={change>=0?'positive':'negative'}>{p.quote?<>{change>=0?<TrendingUp size={18}/>:<TrendingDown size={18}/>} {signedMoney(change)} ({signedPercent(p.quote.changePct)})</>:'Waiting for quote'}</b>
          <small>{p.quote?'Quote observed '+new Date(p.quote.fetchedAt*1000).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}):'Quote unavailable'}{p.quote?.stale?' · Delayed':''}</small>
        </div>
        <div className="stock-terminal-hero-facts">
          <div><span>Open</span><strong>{available(p.quote?.sessionBar?.openCents)}</strong></div>
          <div><span>High</span><strong>{available(p.quote?.sessionBar?.highCents)}</strong></div>
          <div><span>Low</span><strong>{available(p.quote?.sessionBar?.lowCents)}</strong></div>
          <div><span>Prev. close</span><strong>{available(p.quote?.previousCloseCents)}</strong></div>
          <div><span>Held shares</span><strong>{position?.shares??0}</strong></div>
          <div><span>P/L</span><strong className={position?(position.profitCents>=0?'positive':'negative'):''}>{position?signedMoney(position.profitCents):'—'}</strong></div>
        </div>
      </div>
    </header>
    <SectionTabs label="Stock panels" value={p.pane} onChange={p.setPane}
      items={[{id:'chart',label:'Overview'},{id:'order',label:'Trade'},{id:'facts',label:'Details'},{id:'predict',label:'Predict'}]}/>
    <div className="stock-terminal-stage">
      <section className="panel stock-terminal-chart" aria-label={p.symbol+' observed price chart'}>
        <div className="stock-terminal-chart-heading">
          <h2><Crosshair size={16}/> {p.symbol} price history</h2>
          <span className={p.quote?.marketOpen?'positive':'stock-terminal-muted'}>{p.quote?.marketOpen?'Market open':'Market closed'}</span>
        </div>
        <div className="chart-range-bar" role="group" aria-label="Select stock history time range">
          {HISTORY_RANGES.map(range=><button type="button" key={range} aria-pressed={range===p.range}
            className={range===p.range?'active':''} onClick={()=>p.setRange(range)}>{range}</button>)}
        </div>
        <PriceChart key={p.symbol+':'+p.range} history={p.history} quote={p.quote} range={p.range} error={p.historyError}/>
      </section>
      <StockOrderTicket symbol={p.symbol} quote={p.quote} portfolio={p.portfolio}
        side={p.side} setSide={p.setSide} shares={p.shares} setShares={p.setShares}
        orderKind={p.orderKind} setOrderKind={p.setOrderKind} triggerPrice={p.triggerPrice} setTriggerPrice={p.setTriggerPrice}
        total={p.total} canSubmit={p.canSubmit} pending={p.pending} execute={p.execute} openPortfolio={p.openPortfolio}/>
    </div>
    <div className="stock-terminal-bottom">
      <section className="panel stock-terminal-about">
        <div className="stock-terminal-heading"><h2><BriefcaseBusiness size={17}/> About {p.symbol}</h2></div>
        <p>{profile.summary}</p><div className="stock-terminal-tags"><span>{profile.sector}</span><span>{p.symbol}</span></div>
      </section>
      <StockMetrics quote={p.quote} position={position} portfolio={p.portfolio}/>
    </div>
    <aside className="stock-terminal-rail">
      <RelatedStocks symbol={p.symbol} quotes={p.quotes} openStock={p.openStock}/>
      <StockActivity symbol={p.symbol} trades={p.trades}/>
      <StockPredictions key={p.symbol} symbol={p.symbol} quote={p.quote} predictions={p.predictions}
        pending={p.forecastPending} submit={p.submitForecast}/>
    </aside>
  </div>;
}
