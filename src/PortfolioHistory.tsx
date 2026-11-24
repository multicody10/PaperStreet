import { isBuySide, orderLabel } from '../shared/gameplay';
import { ArrowDownLeft, ArrowUpRight, Clock3 } from 'lucide-react';
import type { Trade } from '../shared/stocks';
import { FitPager } from './FitPager';
import { money } from './PriceChart';

export function PortfolioHistory({trades}:{trades:Trade[]}){
  return <section className="panel portfolio-history-panel" aria-label="Executed trade history">
    <div className="panel-heading"><h2><Clock3 size={18}/> Trade history</h2>
      <span className="count-pill">{trades.length} FILLS</span></div>
    <div className="portfolio-history-head"><span>Trade</span><span>Price / total</span><span>Executed</span></div>
    <FitPager items={trades} rowHeight={59} compactRowHeight={63} empty="No executed trades."
      render={items=><div className="portfolio-trades-list">{items.map(trade=><div key={trade.id} className="portfolio-trade-row">
        <span className="portfolio-trade-action">
          <i className={isBuySide(trade.side)?'buy':'sell'}>{isBuySide(trade.side)?<ArrowDownLeft size={14}/>:<ArrowUpRight size={14}/>}</i>
          <span><strong>{orderLabel(trade.side)} {trade.shares} {trade.symbol}</strong><small>{trade.shares} shares</small></span>
        </span>
        <span className="portfolio-trade-value"><strong>{money(trade.shares*trade.priceCents)}</strong>
          <small>{money(trade.priceCents)} per share</small></span>
        <time dateTime={new Date(trade.executedAt*1000).toISOString()}>
          {new Date(trade.executedAt*1000).toLocaleDateString(undefined,{month:'short',day:'numeric'})}
          <small>{new Date(trade.executedAt*1000).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}</small>
        </time>
      </div>)}</div>}/>
  </section>;
}
