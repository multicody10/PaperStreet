import { isBuySide, orderLabel, type OrderSide } from '../shared/gameplay';
import { useState } from 'react';
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, ChevronRight, Clock3, Crosshair, Layers, MoreHorizontal, TrendingDown, TrendingUp, X } from 'lucide-react';
import { HISTORY_RANGES, type ChartHistory, type HistoryRange, type Portfolio, type Quote, type SymbolCode, type Trade } from '../shared/stocks';
import type { OrderKind, Prediction, PredictionDirection } from '../shared/gameplay';
import { FitPager } from './FitPager';
import { money, PriceChart } from './PriceChart';
import { StockPredictions } from './StockPredictions';
import { STOCK_PROFILES } from './stockProfiles';
import { StockMark } from './StockMark';

export type StockPane = 'chart'|'order'|'predict';
export type StockTerminalProps = {
  symbol:SymbolCode;quote?:Quote;quotes:Quote[];portfolio:Portfolio|null;trades:Trade[];
  history?:ChartHistory;historyError?:string;range:HistoryRange;setRange:(v:HistoryRange)=>void;
  pane:StockPane;setPane:(v:StockPane)=>void;onBack:()=>void;openStock:(s:SymbolCode)=>void;openPortfolio:()=>void;
  side:OrderSide;setSide:(v:OrderSide)=>void;
  shares:string;setShares:(v:string)=>void;orderKind:'IMMEDIATE'|OrderKind;setOrderKind:(v:'AUTO'|'IMMEDIATE'|OrderKind)=>void;
  triggerPrice:string;setTriggerPrice:(v:string)=>void;total:number;canSubmit:boolean;pending:boolean;execute:()=>void;
  predictions:Prediction[];forecastPending:boolean;submitForecast:(s:SymbolCode,d:PredictionDirection)=>void;
};
const signedPercent=(value:number)=>(value>0?'+':'')+value.toFixed(2)+'%';
const signedMoney=(cents:number)=>(cents>0?'+':cents<0?'−':'')+money(Math.abs(cents));

function StockOrderTicket(p:Pick<StockTerminalProps,
  'symbol'|'quote'|'portfolio'|'side'|'setSide'|'shares'|'setShares'|'orderKind'|'setOrderKind'|
  'triggerPrice'|'setTriggerPrice'|'total'|'canSubmit'|'pending'|'execute'|'openPortfolio'>) {
  const queued=p.orderKind!=='IMMEDIATE';
  const position=p.portfolio?.positions.find(pos=>pos.symbol===p.symbol);
  const held=position?.shares??0;
  const opening=p.side==='BUY'||p.side==='SHORT';
  const compatible=p.side==='BUY'||p.side==='SELL'?!position?.short:!position||!!position.short;
  const max=!compatible?0:opening&&p.quote?
    Math.min(p.side==='SHORT'?100000-held:100000,Math.floor((p.portfolio?.cashCents??0)/Math.max(1,p.quote.priceCents))):
    !opening?Math.min(100000,held):0;
  const marketValue=p.quote?.marketOpen?'IMMEDIATE':'MARKET';
  return <section className="panel stock-terminal-ticket" aria-label={'Trade '+p.symbol}>
    <div className="stock-ticket-tabs side-selector" role="group" aria-label="Trade direction">
      <button className={p.side==='BUY'?'current buy':''} type="button" aria-pressed={p.side==='BUY'} onClick={()=>p.setSide('BUY')}>Buy</button>
      <button className={p.side==='SELL'?'current sell':''} type="button" aria-pressed={p.side==='SELL'} onClick={()=>p.setSide('SELL')}>Sell</button>
      <button className={p.side==='SHORT'?'current sell':''} type="button" aria-pressed={p.side==='SHORT'} onClick={()=>p.setSide('SHORT')}>Short</button>
      <button className={p.side==='COVER'?'current buy':''} type="button" aria-pressed={p.side==='COVER'} onClick={()=>p.setSide('COVER')}>Cover</button>
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
      <div className="stock-ticket-balance"><span>{opening?'Available paper cash':p.side==='COVER'?'Short shares':'Available shares'}</span>
        <strong>{opening?money(p.portfolio?.cashCents??0):(compatible?held:0).toLocaleString('en-US')}</strong></div>
      <div className="stock-ticket-total"><span>{p.side==='SHORT'?'Required collateral':queued?'Indicative value':'Estimated '+(isBuySide(p.side)?'cost':'proceeds')}</span><strong>{money(p.total)}</strong></div>
      <button type="button" className={'execute-button '+(isBuySide(p.side)?'buy':'sell')} disabled={!p.canSubmit||p.pending} onClick={p.execute}>
        {p.pending?'Processing…':(queued?'Queue ':'')+orderLabel(p.side)+' '+p.symbol}
      </button>
      <p className="stock-ticket-note">{p.side==='SHORT'?'100% collateral; proceeds locked. Auto cover below 25% maintenance margin.':p.side==='COVER'?'Repurchase shares to close the short. Gap losses can create paper debt.':queued?'Queued orders execute with verified prices when market conditions permit.':'Simulated trade using verified market quotes.'}</p>
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
        <StockMark symbol={q.symbol} className="stock-terminal-peer-badge"/><strong>{q.symbol}</strong>
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
        <span className={isBuySide(t.side)?'buy':'sell'}>{isBuySide(t.side)?<ArrowDownLeft size={14}/>:<ArrowUpRight size={14}/>}</span>
        <div><strong>{orderLabel(t.side)} {t.shares} shares</strong><small>{new Date(t.executedAt*1000).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</small></div>
        <b>{money(t.priceCents)}</b>
      </div>)}</div>}/>
  </section>;
}

export function StockTerminal(p:StockTerminalProps){
  const [menuOpen,setMenuOpen]=useState(false);
  const profile=STOCK_PROFILES[p.symbol];
  const position=p.portfolio?.positions.find(v=>v.symbol===p.symbol);
  const change=p.quote?p.quote.priceCents-p.quote.previousCloseCents:0;
  const session=p.quote?.sessionBar;
  const rangePercent=session&&session.highCents>session.lowCents
    ?Math.max(0,Math.min(100,(p.quote!.priceCents-session.lowCents)/(session.highCents-session.lowCents)*100))
    :50;
  return <div className="stock-terminal" data-pane={p.pane} aria-label={'Stock details and trading for '+p.symbol}>
    <div className="stock-terminal-breadcrumb">
      <button type="button" onClick={p.onBack}><ArrowLeft size={16}/> Trade</button>
      <ChevronRight size={13}/><strong>{p.symbol}</strong>
    </div>
    <header className="stock-terminal-hero">
      <div className="stock-terminal-hero-title">
        <StockMark symbol={p.symbol} className="stock-terminal-logo"/>
        <div className="stock-terminal-name">
          <div className="stock-terminal-name-row">
            <h1 title={profile.companyName}>{profile.companyName}</h1>
            <span className="stock-terminal-symbol" aria-label={'Ticker '+p.symbol}>{p.symbol}</span>
          </div>
          <p title={profile.sector}>{profile.sector}</p>
        </div>
        <div className="stock-terminal-header-actions">
          {p.pane!=='chart' && <button type="button" className="stock-terminal-back-chart"
            onClick={()=>{p.setPane('chart');setMenuOpen(false)}}><ArrowLeft size={15}/> Chart</button>}
          <div className="stock-terminal-menu">
            <button type="button" className="stock-terminal-menu-toggle" aria-expanded={menuOpen}
              aria-controls="stock-terminal-menu-options" aria-label="Other stock sections"
              onClick={()=>setMenuOpen(v=>!v)}><MoreHorizontal size={19}/><span>More</span></button>
            {menuOpen && <div className="stock-terminal-menu-options" id="stock-terminal-menu-options" role="group" aria-label="Stock information and forecasts">
              <button type="button" onClick={()=>{p.setPane('order');setMenuOpen(false)}}>
                <ArrowDownLeft size={15}/> Buy or sell shares
              </button>
              <button type="button" onClick={()=>{p.setPane('predict');setMenuOpen(false)}}>
                <TrendingUp size={15}/> Price forecasts
              </button>
              <button type="button" onClick={()=>{p.setPane('chart');setMenuOpen(false)}}>
                <Crosshair size={15}/> Price chart
              </button>
              <button type="button" className="stock-terminal-menu-close" onClick={()=>setMenuOpen(false)}>
                <X size={14}/> Close menu
              </button>
            </div>}
          </div>
        </div>
      </div>
      <div className="stock-terminal-quote-summary">
        <div className="stock-terminal-price"><strong>{p.quote?money(p.quote.priceCents):'—'}</strong>
          <b className={change>=0?'positive':'negative'}>{p.quote?<>{change>=0?<TrendingUp size={18}/>:<TrendingDown size={18}/>} {signedMoney(change)} ({signedPercent(p.quote.changePct)})</>:'Waiting for quote'}</b>
          <small>{p.quote?'Quote observed '+new Date(p.quote.fetchedAt*1000).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}):'Quote unavailable'}{p.quote?.stale?' · Delayed':''}</small>
        </div>
        <div className="stock-terminal-snapshot" aria-label="Daily range and your position">
          <div className="stock-terminal-snapshot-range">
            <div className="stock-terminal-snapshot-label"><span>Day range</span><small>{p.quote?.marketOpen?'Current session':'Last session'}</small></div>
            {session ? <>
              <div className="stock-terminal-range-track" aria-label={`From ${money(session.lowCents)} to ${money(session.highCents)}; last ${money(p.quote!.priceCents)}`}>
                <i style={{left:rangePercent+'%'}}/>
              </div>
              <div className="stock-terminal-range-values">
                <strong>{money(session.lowCents)}</strong><strong>{money(session.highCents)}</strong>
              </div>
            </> : <div className="stock-terminal-snapshot-empty">Session range unavailable</div>}
          </div>
          <div className="stock-terminal-position-brief">
            <div className="stock-terminal-snapshot-label"><span>Your position</span></div>
            {position?.shares ? <>
              <div className="stock-terminal-position-main">
                <strong>{position.shares.toLocaleString('en-US')} {position.short?'short':position.shares===1?'share':'shares'}</strong>
                <span className={position.profitCents>=0?'positive':'negative'}>{signedMoney(position.profitCents)}</span>
              </div>
              <small>{money(position.marketValueCents)} {position.short?'short exposure':'market value'} <span>· Unrealized return</span></small>
            </> : <>
              <div className="stock-terminal-position-main"><strong>Not owned</strong></div>
              <small>No position in {p.symbol}</small>
            </>}
          </div>
        </div>
      </div>
    </header>
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
    <aside className="stock-terminal-rail">
      <RelatedStocks symbol={p.symbol} quotes={p.quotes} openStock={p.openStock}/>
      <StockActivity symbol={p.symbol} trades={p.trades}/>
      <StockPredictions key={p.symbol} symbol={p.symbol} quote={p.quote} predictions={p.predictions}
        pending={p.forecastPending} submit={p.submitForecast}/>
    </aside>
  </div>;
}
