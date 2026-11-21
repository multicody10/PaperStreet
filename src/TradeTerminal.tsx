import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Search, SlidersHorizontal } from 'lucide-react';
import { HISTORY_RANGES, type ChartHistory, type HistoryRange, type Portfolio, type Quote, type SymbolCode } from '../shared/stocks';
import type { OrderKind } from '../shared/gameplay';
import { DayRange, money, PriceChart } from './PriceChart';
import { FitPager, SectionTabs } from './FitPager';

export type AssetFilter = 'all'|'stocks'|'etf';
export type SortMode = 'symbol'|'change'|'price';
export type MoversMode = 'gainers'|'losers'|'all';

export type TradeTerminalProps = {
  quotes:Quote[];selectedSymbol:SymbolCode;setSelectedSymbol:(symbol:SymbolCode)=>void;
  openStock:(symbol:SymbolCode)=>void;history?:ChartHistory;historyError?:string;
  range:HistoryRange;setRange:(range:HistoryRange)=>void;portfolio:Portfolio|null;
  side:'BUY'|'SELL';setSide:(side:'BUY'|'SELL')=>void;
  shares:string;setShares:(shares:string)=>void;
  orderKind:'IMMEDIATE'|OrderKind;setOrderKind:(kind:'AUTO'|'IMMEDIATE'|OrderKind)=>void;
  triggerPrice:string;setTriggerPrice:(value:string)=>void;
  total:number;canSubmit:boolean;pending:boolean;execute:()=>void;
};
const snapshotSymbols:SymbolCode[]=['SPY','AAPL','MSFT','NVDA','TSLA'];
const signedPercent=(value:number)=>(value>0?'+':'')+value.toFixed(2)+'%';
const signedMoney=(value:number)=>(value>0?'+':value<0?'−':'')+money(Math.abs(value));
const isETF=(symbol:SymbolCode)=>symbol==='SPY';

export function selectTradeQuotes(quotes:readonly Quote[],filter:AssetFilter,search:string,sort:SortMode):Quote[]{
  const needle=search.trim().toLowerCase();
  return quotes.filter(q=>(filter==='all'||(filter==='etf')===isETF(q.symbol))&&
    (q.symbol+' '+q.name).toLowerCase().includes(needle))
    .sort((a,b)=>sort==='symbol'?a.symbol.localeCompare(b.symbol):
      sort==='change'?b.changePct-a.changePct||a.symbol.localeCompare(b.symbol):
      b.priceCents-a.priceCents||a.symbol.localeCompare(b.symbol));
}
export function selectTradeMovers(quotes:readonly Quote[],mode:MoversMode):Quote[]{
  return quotes.filter(q=>mode==='all'||(mode==='gainers'?q.changePct>0:q.changePct<0))
    .sort((a,b)=>mode==='losers'?a.changePct-b.changePct||a.symbol.localeCompare(b.symbol):
      mode==='gainers'?b.changePct-a.changePct||a.symbol.localeCompare(b.symbol):
      Math.abs(b.changePct)-Math.abs(a.changePct)||a.symbol.localeCompare(b.symbol));
}

function TradeOrderTicket(p:Pick<TradeTerminalProps,
  'side'|'setSide'|'shares'|'setShares'|'orderKind'|'setOrderKind'|
  'triggerPrice'|'setTriggerPrice'|'total'|'canSubmit'|'pending'|'execute'|'portfolio'> & {quote?:Quote}) {
  const queued=p.orderKind!=='IMMEDIATE';
  const max=p.side==='BUY'&&p.quote
    ? Math.min(100000,Math.floor((p.portfolio?.cashCents??0)/Math.max(1,p.quote.priceCents)))
    : Math.min(100000,p.portfolio?.positions.find(pos=>pos.symbol===p.quote?.symbol)?.shares??0);
  return <section className="panel trade-terminal-ticket" aria-label="Trade order ticket">
    <div className="trade-terminal-ticket-header">
      <h2><ArrowDownLeft size={16}/> Place paper order</h2>
      <span className="trade-terminal-mode">{queued?'QUEUED':'LIVE SESSION'}</span>
    </div>
    <div className="trade-terminal-ticket-body">
      <div className="side-selector trade-terminal-side">
        <button type="button" className={p.side==='BUY'?'current buy':''} aria-pressed={p.side==='BUY'} onClick={()=>p.setSide('BUY')}>Buy</button>
        <button type="button" className={p.side==='SELL'?'current sell':''} aria-pressed={p.side==='SELL'} onClick={()=>p.setSide('SELL')}>Sell</button>
      </div>
      <div className="trade-terminal-field">
        <span className="trade-terminal-field-label">Symbol</span>
        <div className="trade-terminal-symbol"><strong>{p.quote?.symbol??'—'}</strong><small>{p.quote?.name??'Select an asset'}</small></div>
      </div>
      <div className="trade-terminal-field">
        <label htmlFor="market-trade-shares" className="trade-terminal-field-label">Quantity <small>Max {max}</small></label>
        <div className="trade-terminal-quantity"><input id="market-trade-shares" type="number" inputMode="numeric"
          min="1" step="1" max="100000" value={p.shares} onChange={e=>p.setShares(e.target.value)}/>
          <span>shares</span></div>
      </div>
      <div className="trade-terminal-field">
        <span className="trade-terminal-field-label">Order type</span>
        <div className="terminal-order-types trade-terminal-types" role="group" aria-label="Paper order type">
          {(['MARKET','LIMIT','STOP'] as const).map(kind=><button type="button" key={kind}
            aria-pressed={kind==='MARKET'?(p.orderKind==='MARKET'||p.orderKind==='IMMEDIATE'):p.orderKind===kind}
            className={(kind==='MARKET'?(p.orderKind==='MARKET'||p.orderKind==='IMMEDIATE'):p.orderKind===kind)?'active':''}
            onClick={()=>p.setOrderKind(kind==='MARKET'?(p.quote?.marketOpen?'IMMEDIATE':'MARKET'):kind)}>
            {kind==='MARKET'?'Market':kind==='LIMIT'?'Limit':'Stop'}</button>)}
        </div>
      </div>
      {(p.orderKind==='LIMIT'||p.orderKind==='STOP')&&<div className="trade-terminal-field">
        <label htmlFor="market-trade-trigger" className="trade-terminal-field-label">
          {p.orderKind==='LIMIT'?'Limit price':'Stop price'} (USD)</label>
        <input id="market-trade-trigger" className="trade-terminal-input" type="number" inputMode="decimal"
          min=".01" step=".01" placeholder="0.00" value={p.triggerPrice} onChange={e=>p.setTriggerPrice(e.target.value)}/>
      </div>}
      <div className="trade-terminal-estimate"><span>{queued?'Indicative value':'Estimated total'} (Paper)</span><strong>{money(p.total)}</strong></div>
      <button type="button" className={'execute-button '+p.side.toLowerCase()} disabled={!p.canSubmit||p.pending}
        onClick={p.execute}>
        {p.pending?'Processing…':(queued?'Queue':'Place')+' '+(p.side==='BUY'?'Buy':'Sell')+' Order (Paper)'}
      </button>
      <p className="trade-terminal-note">
        {queued?'Orders execute only when verified market quotes meet their conditions.':'Virtual funds only. Executions use verified market quotes.'}
      </p>
    </div>
  </section>;
}

export function TradeTerminal(p:TradeTerminalProps) {
  const [section,setSection]=useState<'overview'|'stocks'|'movers'|'order'>('overview');
  const [search,setSearch]=useState('');
  const [assetFilter,setAssetFilter]=useState<AssetFilter>('all');
  const [sort,setSort]=useState<SortMode>('symbol');
  const [moversMode,setMoversMode]=useState<MoversMode>('gainers');
  const selected=p.quotes.find(q=>q.symbol===p.selectedSymbol);
  const filtered=useMemo(()=>selectTradeQuotes(p.quotes,assetFilter,search,sort),[p.quotes,assetFilter,search,sort]);
  const movers=useMemo(()=>selectTradeMovers(p.quotes,moversMode),[p.quotes,moversMode]);
  const positive=p.quotes.filter(q=>q.changePct>0).length;
  const negative=p.quotes.filter(q=>q.changePct<0).length;
  const unchanged=p.quotes.length-positive-negative;
  const base=Math.max(p.quotes.length,1);
  const choose=(symbol:SymbolCode)=>{
    p.setSelectedSymbol(symbol);
    if(window.matchMedia('(max-width:760px)').matches)setSection('overview');
  };
  return <div className="trade-terminal" data-section={section} aria-label="Stock trading terminal">
    <div className="trade-terminal-main">
      <div className="trade-terminal-title">
        <h1>Trade</h1><p>Browse markets, analyze real quotes, and place paper trades.</p>
      </div>
      <div className="trade-terminal-strip" aria-label="Tracked market prices">
        {snapshotSymbols.map(symbol=>{
          const q=p.quotes.find(quote=>quote.symbol===symbol);
          return <button key={symbol} type="button" className={'trade-terminal-snapshot '+(p.selectedSymbol===symbol?'selected':'')}
            onClick={()=>choose(symbol)} disabled={!q} aria-pressed={p.selectedSymbol===symbol}>
            <span>{symbol==='SPY'?'S&P 500 ETF':symbol}</span>
            <strong>{q?money(q.priceCents):'—'}</strong>
            <b className={q&&q.changePct<0?'negative':'positive'}>{q?signedPercent(q.changePct):'—'}</b>
          </button>;
        })}
      </div>
      <section className="panel trade-market-overview">
        <div className="trade-market-overview-head">
          <h2>Market overview <small>{p.selectedSymbol}{selected?.stale?' · Delayed':''}</small></h2>
          <div className="chart-range-bar" role="group" aria-label="Market overview chart range">
            {HISTORY_RANGES.map(range=><button type="button" key={range} className={range===p.range?'active':''}
              aria-pressed={range===p.range} onClick={()=>p.setRange(range)}>{range}</button>)}
          </div>
          <button type="button" className="trade-terminal-full" onClick={()=>p.openStock(p.selectedSymbol)}>
            Full chart <ArrowUpRight size={14}/>
          </button>
        </div>
        <div className="trade-market-overview-body">
          <div className="trade-market-overview-metrics">
            <strong>{p.selectedSymbol}</strong><small>{selected?.name??'No quote available'}</small>
            <b>{selected?money(selected.priceCents):'—'}</b>
            <span className={selected&&selected.changePct<0?'negative':'positive'}>
              {selected?signedMoney(selected.priceCents-selected.previousCloseCents)+' ('+signedPercent(selected.changePct)+')':'—'}
            </span>
            <div className="trade-market-overview-ohlc">
              <span>Open <b>{selected?.sessionBar?money(selected.sessionBar.openCents):'—'}</b></span>
              <span>High <b>{selected?.sessionBar?money(selected.sessionBar.highCents):'—'}</b></span>
              <span>Low <b>{selected?.sessionBar?money(selected.sessionBar.lowCents):'—'}</b></span>
              <span>Prev close <b>{selected?money(selected.previousCloseCents):'—'}</b></span>
            </div>
          </div>
          <PriceChart key={p.selectedSymbol+':'+p.range} history={p.history} quote={selected} range={p.range} error={p.historyError}/>
        </div>
      </section>
      <section className="panel trade-market-list">
        <div className="trade-market-list-bar">
          <div className="trade-market-asset-tabs" role="group" aria-label="Asset type">
            {([{id:'all',name:'All'},{id:'stocks',name:'Stocks'},{id:'etf',name:'ETFs'}] as const)
              .map(item=><button type="button" key={item.id} className={assetFilter===item.id?'active':''}
                aria-pressed={assetFilter===item.id} onClick={()=>setAssetFilter(item.id)}>{item.name}</button>)}
          </div><span className="trade-market-list-count">{filtered.length} assets</span>
        </div>
        <div className="trade-market-filters">
          <label className="trade-market-sort-label" htmlFor="trade-market-sort"><SlidersHorizontal size={14}/> Sort</label>
          <select id="trade-market-sort" value={sort} onChange={e=>setSort(e.target.value as SortMode)}>
            <option value="symbol">Symbol</option><option value="change">Change %</option><option value="price">Last price</option>
          </select>
          <label className="trade-market-search"><Search size={15}/><input type="search" value={search}
            onChange={e=>setSearch(e.target.value)} placeholder="Search stocks…" aria-label="Search stocks"/></label>
        </div>
        <div className="trade-market-table-head">
          <span>Symbol</span><span>Company</span><span>Price</span><span>Change</span>
          <span>Change %</span><span>Prev close</span><span>Day range</span>
        </div>
        <FitPager items={filtered} rowHeight={41} compactRowHeight={44} compactBreakpoint={1050}
          empty={p.quotes.length?'No matching assets':'No verified quotes available'}
          render={items=><div className="trade-market-table-body">{items.map(q=>
            <button type="button" className={'trade-market-table-row '+(selected?.symbol===q.symbol?'selected':'')}
              key={q.symbol} onClick={()=>choose(q.symbol)} aria-pressed={selected?.symbol===q.symbol}>
              <strong className="trade-market-table-symbol"><i>{q.symbol.slice(0,2)}</i>{q.symbol}</strong>
              <span className="trade-market-table-company">{q.name}{q.stale?' · Delayed':''}</span>
              <span>{money(q.priceCents)}</span>
              <span className={q.changePct>=0?'positive':'negative'}>{signedMoney(q.priceCents-q.previousCloseCents)}</span>
              <span className={q.changePct>=0?'positive':'negative'}>{signedPercent(q.changePct)}</span>
              <span>{money(q.previousCloseCents)}</span>
              <span className="trade-market-table-range"><DayRange quote={q}/></span>
            </button>)}</div>}/>
      </section>
    </div>
    <aside className="trade-terminal-rail" aria-label="Market data and order controls">
      <section className="panel trade-market-movers">
        <div className="trade-rail-heading"><h2>Market movers</h2><span>{p.quotes.length} tracked</span></div>
        <div className="trade-mover-tabs" role="group" aria-label="Movers filter">
          {([{id:'gainers',title:'Gainers'},{id:'losers',title:'Losers'},{id:'all',title:'All movers'}] as const)
            .map(t=><button type="button" key={t.id} aria-pressed={moversMode===t.id}
              className={moversMode===t.id?'active':''} onClick={()=>setMoversMode(t.id)}>{t.title}</button>)}
        </div>
        <FitPager items={movers} rowHeight={35} compactRowHeight={37}
          empty={p.quotes.length?'No movers in this group':'Market quotes unavailable'}
          render={items=><div className="trade-movers-list">{items.map(q=>
            <button type="button" key={q.symbol} onClick={()=>choose(q.symbol)} className="trade-mover-row">
              <strong>{q.symbol}</strong><span>{money(q.priceCents)}</span>
              <b className={q.changePct>=0?'positive':'negative'}>{signedPercent(q.changePct)}</b>
            </button>)}</div>}/>
      </section>
      <section className="panel trade-market-breadth">
        <div className="trade-rail-heading"><h2>Market breadth</h2><span>Supported assets</span></div>
        <div className="trade-breadth-body">
          {([{name:'Advancing',value:positive,css:'up'},{name:'Declining',value:negative,css:'down'},
            {name:'Unchanged',value:unchanged,css:'flat'}] as const)
            .map(item=><div key={item.name} className="trade-breadth-row">
              <span>{item.name}</span><div className="trade-breadth-track"><i className={item.css} style={{width:item.value/base*100+'%'}}/></div>
              <strong>{item.value}</strong></div>)}
        </div>
      </section>
      <TradeOrderTicket quote={selected} portfolio={p.portfolio} side={p.side} setSide={p.setSide}
        shares={p.shares} setShares={p.setShares} orderKind={p.orderKind} setOrderKind={p.setOrderKind}
        triggerPrice={p.triggerPrice} setTriggerPrice={p.setTriggerPrice}
        total={p.total} canSubmit={p.canSubmit} pending={p.pending} execute={p.execute}/>
    </aside>
    <SectionTabs items={[{id:'overview',label:'Overview'},{id:'stocks',label:'Stocks'},
      {id:'movers',label:'Movers'},{id:'order',label:'Order'}]}
      value={section} onChange={setSection} label="Trade sections"/>
  </div>;
}
