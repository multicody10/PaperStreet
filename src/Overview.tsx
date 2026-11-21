import { CalendarDays, ChartCandlestick, ShieldCheck } from 'lucide-react';
import type { Leader, Portfolio, Quote, SymbolCode, Trade } from '../shared/stocks';
import { BalanceCard, Holdings, MarketList, MarketMix, MarketPulse, OrderList, Rankings } from './OverviewPanels';

type Props = {
  markets: boolean; userId?: string; startingCash: number; portfolio: Portfolio | null;
  quotes: Quote[]; trades: Trade[]; leaders: Leader[];
  onMarkets: () => void; onStock: (symbol: SymbolCode) => void; onAnalytics: () => void;
  onPortfolio: () => void; onHistory: () => void; onRankings: () => void;
};

export function Overview(p: Props) {
  const connected = !!p.userId;
  const date = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date());
  return <section className="overview-screen" aria-label={p.markets ? 'Markets' : 'Trading overview'}>
    <div className="content">
      <div className="page-heading"><h1>{p.markets ? 'Markets' : 'Trading overview'}</h1>
        <span className="date"><CalendarDays size={15}/>{date}</span></div>
      {!p.markets && <BalanceCard portfolio={p.portfolio} connected={connected} startingCash={p.startingCash} onMarkets={p.onMarkets}/>}
      {connected && <button type="button" className="analytics-link" onClick={p.onAnalytics}><ChartCandlestick size={16}/>Dashboard analytics</button>}
      <div className="market-layout">
        <MarketList quotes={p.quotes} connected={connected} onStock={p.onStock} onAll={p.markets ? undefined : p.onMarkets}/>
        <MarketMix/>
      </div>
      {connected && <>
        <div className="account-grid">
          <Holdings portfolio={p.portfolio} onStock={p.onStock} onAll={p.onPortfolio} empty="Your holdings will appear after your first purchase."/>
          <Rankings leaders={p.leaders} userId={p.userId} onAll={p.onRankings} empty="Rankings will appear when players join."/>
        </div>
        <div className="market-layout">
          <OrderList trades={p.trades} onAll={p.onHistory} empty="Your completed orders will appear here."/>
          <MarketPulse quotes={p.quotes} onStock={p.onStock}/>
        </div>
      </>}
      <footer className="workspace-footer"><span><ShieldCheck size={14}/>Virtual funds only</span><span>Market prices may be delayed</span></footer>
    </div>
  </section>;
}
