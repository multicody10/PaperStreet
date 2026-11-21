import { useMemo, useState } from 'react';
import { ArrowUpRight, Search, SlidersHorizontal } from 'lucide-react';
import { HISTORY_RANGES, type ChartHistory, type HistoryRange, type Quote, type SymbolCode } from '../shared/stocks';
import { DayRange, money, PriceChart } from './PriceChart';
import { FitPager, SectionTabs } from './FitPager';

export type AssetFilter = 'all'|'stocks'|'etf';
export type SortMode = 'symbol'|'change'|'price';

export type TradeTerminalProps = {
  quotes:Quote[];selectedSymbol:SymbolCode;openStock:(symbol:SymbolCode)=>void;
  history?:ChartHistory;historyError?:string;range:HistoryRange;setRange:(range:HistoryRange)=>void;
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
export function TradeTerminal(p:TradeTerminalProps) {
  const [section,setSection]=useState<'overview'|'stocks'>('overview');
  const [search,setSearch]=useState('');
  const [assetFilter,setAssetFilter]=useState<AssetFilter>('all');
  const [sort,setSort]=useState<SortMode>('symbol');
  const selected=p.quotes.find(q=>q.symbol===p.selectedSymbol);
  const filtered=useMemo(()=>selectTradeQuotes(p.quotes,assetFilter,search,sort),[p.quotes,assetFilter,search,sort]);
  const choose=(symbol:SymbolCode)=>p.openStock(symbol);
  return <div className="trade-terminal" data-section={section} aria-label="Stock discovery and market overview">
    <div className="trade-terminal-main">
      <div className="trade-terminal-title">
        <h1>Trade</h1><p>Browse verified market quotes. Select any stock to open its trading page.</p>
      </div>
      <div className="trade-terminal-strip" aria-label="Tracked market prices">
        {snapshotSymbols.map(symbol=>{
          const q=p.quotes.find(quote=>quote.symbol===symbol);
          return <button key={symbol} type="button" className={'trade-terminal-snapshot '+(p.selectedSymbol===symbol?'selected':'')}
            onClick={()=>choose(symbol)} disabled={!q} title={'Open '+symbol+' trading page'}>
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
              key={q.symbol} onClick={()=>choose(q.symbol)} title={'Open '+q.symbol+' trading page'}>
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
    <SectionTabs items={[{id:'overview',label:'Overview'},{id:'stocks',label:'All stocks'}]}
      value={section} onChange={setSection} label="Trade sections"/>
  </div>;
}
