import { useState } from 'react';
import { CalendarDays, ChartCandlestick, ShieldCheck } from 'lucide-react';
import type { Leader, Portfolio, Quote, SymbolCode, Trade } from '../shared/stocks';
import { SectionTabs } from './FitPager';
import { BalanceCard, Holdings, MarketList, MarketMix, MarketPulse, OrderList, Rankings } from './OverviewPanels';

type Props = {
  markets: boolean; userId?: string; startingCash: number; portfolio: Portfolio | null;
  quotes: Quote[]; trades: Trade[]; leaders: Leader[];
  onMarkets: () => void; onStock: (symbol: SymbolCode) => void; onAnalytics: () => void;
  onPortfolio: () => void; onHistory: () => void; onRankings: () => void;
};
type OverviewSection = 'summary' | 'markets' | 'account' | 'activity';
type DetailPanel = 'first' | 'second';

export function Overview(p: Props) {
  const connected = !!p.userId;
  const [section, setSection] = useState<OverviewSection>(p.markets ? 'markets' : 'summary');
  const [detail, setDetail] = useState<DetailPanel>('first');
  const date = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date());
  const sections: { id: OverviewSection; label: string }[] = [
    { id: 'summary', label: 'Overview' }, { id: 'markets', label: 'Markets' },
    ...(connected ? [{ id: 'account' as const, label: 'Account' }, { id: 'activity' as const, label: 'Activity' }] : []),
  ];
  const detailLabels = section === 'markets' ? ['Assets', 'Breakdown'] :
    section === 'account' ? ['Holdings', 'Rankings'] : ['Orders', 'Market pulse'];
  const changeSection = (next: OverviewSection) => { setSection(next); setDetail('first'); };

  return <section className="overview-screen" data-section={section} aria-label={p.markets ? 'Markets' : 'Trading overview'}>
    <div className="content">
      <div className="page-heading">
        <h1>{section === 'summary' ? 'Trading overview' : section === 'markets' ? 'Markets' :
          section === 'account' ? 'Your account' : 'Trading activity'}</h1>
        <div className="overview-page-tools">
          {connected && !p.markets && <button type="button" className="analytics-link" onClick={p.onAnalytics}>
            <ChartCandlestick size={16}/> Dashboard analytics
          </button>}
          <span className="date"><CalendarDays size={15}/>{date}</span>
        </div>
      </div>
      <SectionTabs items={sections} value={section} onChange={changeSection} label="Overview sections"/>
      {section !== 'summary' && <div className="overview-mobile-subtabs" role="group" aria-label="Visible overview panel">
        {(['first', 'second'] as const).map((value, i) =>
          <button key={value} type="button" className={detail === value ? 'active' : ''}
            aria-pressed={detail === value} onClick={() => setDetail(value)}>{detailLabels[i]}</button>)}
      </div>}
      <div className="overview-focus" data-mobile-panel={detail}>
        {section === 'summary' ? <div className="overview-summary-layout">
          <div className="overview-summary-stack">
            <BalanceCard portfolio={p.portfolio} connected={connected} startingCash={p.startingCash} onMarkets={p.onMarkets}/>
            <MarketPulse quotes={p.quotes} onStock={p.onStock}/>
          </div>
          <MarketList quotes={p.quotes} connected={connected} onStock={p.onStock} onAll={p.onMarkets}/>
        </div> : section === 'markets' ? <div className="overview-pane-grid overview-markets-layout">
          <MarketList quotes={p.quotes} connected={connected} onStock={p.onStock}/>
          <MarketMix/>
        </div> : section === 'account' ? <div className="overview-pane-grid">
          <Holdings portfolio={p.portfolio} onStock={p.onStock} onAll={p.onPortfolio}
            empty="Your holdings will appear after your first purchase."/>
          <Rankings leaders={p.leaders} userId={p.userId} onAll={p.onRankings}
            empty="Rankings will appear when players join."/>
        </div> : <div className="overview-pane-grid">
          <OrderList trades={p.trades} onAll={p.onHistory} empty="Your completed orders will appear here."/>
          <MarketPulse quotes={p.quotes} onStock={p.onStock}/>
        </div>}
      </div>
      <footer className="workspace-footer">
        <span><ShieldCheck size={14}/>Virtual funds only</span>
        <span>Market prices may be delayed</span>
      </footer>
    </div>
  </section>;
}
