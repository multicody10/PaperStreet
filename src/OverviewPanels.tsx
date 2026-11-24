import { isBuySide, tradeVerb } from '../shared/gameplay';
import { useState, type CSSProperties, type ReactNode } from 'react';
import {
  Activity, ArrowDownLeft, ArrowUpRight, BriefcaseBusiness, CandlestickChart,
  ChartNoAxesColumnIncreasing, ChartPie, ChevronRight, Clock3,
  Layers3, ListFilter, Search, Trophy, Wallet,
  type LucideIcon,
} from 'lucide-react';
import { STOCKS, type Leader, type Portfolio, type Quote, type SymbolCode, type Trade } from '../shared/stocks';
import { DayRange, money } from './PriceChart';
import { FitPager } from './FitPager';
import { StockMark } from './StockMark';
export { StockMark } from './StockMark';

export const signedMoney = (cents: number) => `${cents > 0 ? '+' : ''}${money(cents)}`;
export const pct = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
export const tone = (n: number) => n > 0 ? 'positive' : n < 0 ? 'negative' : '';
const sectors = [
  { name: 'Technology', color: '#c4f66a' },
  { name: 'Communication services', color: '#8ba3fa' },
  { name: 'Consumer discretionary', color: '#5dcbb9' },
  { name: 'Index ETF', color: '#edb46f' },
] as const;
const sectorFor: Record<SymbolCode, number> = {
  AAPL: 0, MSFT: 0, NVDA: 0, AMD: 0, INTC: 0, GOOGL: 1, META: 1, NFLX: 1, DIS: 1,
  AMZN: 2, TSLA: 2, SPY: 3,
};
const stocks = STOCKS.map(stock => ({ ...stock, sector: sectors[sectorFor[stock.symbol]] }));

export function ProfileAvatar({ url, name }: { url?: string; name: string }) {
  const [failedUrl, setFailedUrl] = useState('');
  return <span className="overview-avatar" aria-hidden="true">{url && failedUrl !== url
    ? <img src={url} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setFailedUrl(url)}/>
    : name.slice(0, 1).toUpperCase()}</span>;
}

export function PanelHeading({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return <header className="overview-panel-heading"><h2><Icon size={19} strokeWidth={1.7}/>{title}</h2>{children}</header>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="overview-empty-state">{children}</div>;
}

export function BalanceCard({ portfolio, connected, startingCash, onMarkets }: {
  portfolio: Portfolio | null; connected: boolean; startingCash: number; onMarkets: () => void;
}) {
  const balance = connected ? portfolio?.equityCents : startingCash;
  const metrics: { label: string; value: string; icon: LucideIcon; color?: string }[] = connected ? [
    { label: 'Buying power', icon: Wallet, value: portfolio ? money(portfolio.cashCents) : '—' },
    { label: 'Holdings value', icon: BriefcaseBusiness, value: portfolio ? money(portfolio.investedCents) : '—' },
    { label: 'All-time return', icon: ChartNoAxesColumnIncreasing, value: portfolio ? pct(100 * portfolio.profitCents / portfolio.startingCashCents) : '—', color: tone(portfolio?.profitCents ?? 0) },
  ] : [
    { label: 'Tradable assets', icon: Layers3, value: String(STOCKS.length) },
    { label: 'Order types', icon: CandlestickChart, value: '3' },
    { label: 'After hours', icon: Clock3, value: 'Queued' },
  ];
  return <section className="balance-card" aria-label="Account summary">
    <div className="balance-hero">
      <div className="bull-art" aria-hidden="true"/>
      <div className="balance-copy">
        <div className="balance-label"><Wallet size={15}/>{connected ? 'Portfolio value' : 'Starting balance'}</div>
        <div className="balance-amount"><strong>{balance === undefined ? '—' : money(balance)}</strong><span>USD</span></div>
        <div className="balance-caption">{connected
          ? portfolio && <><b className={tone(portfolio.profitCents)}>{signedMoney(portfolio.profitCents)}</b> all time</>
          : 'Launch in Discord to trade'}</div>
        <button type="button" className="overview-primary-button" onClick={onMarkets}><CandlestickChart size={16}/>Explore markets</button>
      </div>
    </div>
    <div className="metrics">{metrics.map(({ label, value, icon: Icon, color }) => <div className="metric" key={label}>
      <span className="metric-label"><Icon size={15}/>{label}</span><strong className={color}>{value}</strong>
    </div>)}</div>
  </section>;
}

export function MarketList({ quotes, connected, onStock, onAll }: {
  quotes: Quote[]; connected: boolean; onStock: (symbol: SymbolCode) => void; onAll?: () => void;
}) {
  const [filter, setFilter] = useState('All assets');
  const [search, setSearch] = useState('');
  const term = search.toLowerCase().trim();
  const matches = stocks.filter(({ name, symbol }) =>
    (filter === 'All assets' || (filter === 'ETFs') === (symbol === 'SPY')) &&
    (symbol + ' ' + name).toLowerCase().includes(term));
  const rows = onAll ? matches.slice(0, 5) : matches;
  return <section className="overview-panel overview-market-panel">
    <PanelHeading icon={CandlestickChart} title={onAll ? 'Market overview' : 'Asset directory'}>
      {onAll ? <button type="button" className="overview-text-button" onClick={onAll}>View all <ChevronRight size={14}/></button>
        : <span className="panel-meta">{matches.length} assets</span>}
    </PanelHeading>
    <div className="market-tools">
      <div className="segmented" role="group" aria-label="Filter assets">{['All assets', 'Stocks', 'ETFs'].map(label =>
        <button type="button" key={label} aria-pressed={label === filter} onClick={() => setFilter(label)}>{label}</button>)}</div>
      {!onAll && <label className="search"><Search size={15}/><input type="search" aria-label="Search stocks"
        placeholder="Search stocks" value={search} onChange={e => setSearch(e.target.value)}/></label>}
    </div>
    <div className={'market-table ' + (!onAll && connected ? 'with-range' : '')}>
      <div className="market-columns table-label"><span>Asset</span><span>{connected ? 'Last price' : 'Sector'}</span>
        {!onAll && connected && <span className="range-column">Day range</span>}<span>{connected ? 'Day change' : 'Type'}</span><span/></div>
      <FitPager key={filter + ':' + term + ':' + String(!!onAll)} items={rows}
        rowHeight={57} compactRowHeight={54} compactBreakpoint={670}
        empty="No assets match your search."
        render={page => <div className="overview-market-rows">{page.map(({ symbol, name, sector }) => {
          const quote = quotes.find(q => q.symbol === symbol);
          return <button type="button" key={symbol} className="market-columns overview-market-row"
            aria-label={'Open ' + name + ' (' + symbol + ')'} onClick={() => onStock(symbol)}>
            <span className="asset-cell"><StockMark symbol={symbol}/><span><strong>{symbol}</strong>
              <small>{name}{quote?.stale ? ' · Stale' : ''}</small></span></span>
            {connected ? <><span className="number">{quote ? money(quote.priceCents) : '—'}</span>
              {!onAll && <span className="range-column">{quote && <DayRange quote={quote}/>}</span>}
              <span className={'number ' + tone(quote?.changePct ?? 0)}>{quote ? pct(quote.changePct) : '—'}</span></>
              : <><span className="sector-name"><i style={{ background: sector.color }}/>{sector.name}</span>
                <span className="asset-type">{symbol === 'SPY' ? 'ETF' : 'Stock'}</span></>}
            <ChevronRight size={14} className="row-chevron"/>
          </button>;
        })}</div>}/>
    </div>
  </section>;
}

export function MarketMix() {
  let offset = 0;
  const breakdown = sectors.map(sector => {
    const count = stocks.filter(stock => stock.sector === sector).length;
    const start = offset;
    offset += count / stocks.length * 100;
    return { ...sector, count, arc: `${sector.color} ${start}% ${offset - 1.1}%, var(--panel) ${offset - 1.1}% ${offset}%` };
  });
  return <section className="overview-panel mix-overview-panel">
    <PanelHeading icon={ChartPie} title="Market breakdown"/>
    <div className="mix-content">
      <div className="donut" style={{ '--sectors': breakdown.map(s => s.arc).join(', ') } as CSSProperties}>
        <div><strong>{stocks.length}</strong><span>Assets</span></div>
      </div>
      <ul className="legend">{breakdown.map(({ name, color, count }) => <li key={name}><i style={{ background: color }}/><span>{name}</span><b>{count}</b></li>)}</ul>
    </div>
  </section>;
}

export function MarketPulse({ quotes, onStock }: { quotes: Quote[]; onStock: (symbol: SymbolCode) => void }) {
  const movers = [...quotes].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 5);
  return <section className="overview-panel overview-pulse-panel">
    <PanelHeading icon={Activity} title="Market pulse"/>
    <div className="breadth">{[1, -1].map(sign => <div key={sign}>
      <span>{sign > 0 ? 'Advancing' : 'Declining'}</span>
      <strong className={tone(sign)}>{quotes.length ? quotes.filter(q => Math.sign(q.changePct) === sign).length : '—'}</strong>
    </div>)}</div>
    <h3 className="list-subhead">Biggest movers</h3>
    <FitPager items={movers} rowHeight={47} compactRowHeight={45} empty="Waiting for market quotes."
      render={page => <div className="overview-pulse-rows">{page.map(q =>
        <button type="button" className="plain-row" key={q.symbol} onClick={() => onStock(q.symbol)}>
          <span className="asset-cell"><StockMark symbol={q.symbol}/><strong>{q.symbol}</strong></span>
          <b className={tone(q.changePct)}>{pct(q.changePct)}</b>
        </button>)}</div>}/>
  </section>;
}

type AccountListProps = { detail?: boolean; empty: string; onAll?: () => void };
function ListAction({ onAll, count }: { onAll?: () => void; count: number }) {
  return onAll ? <button type="button" className="overview-text-button" onClick={onAll}>View all <ChevronRight size={14}/></button> : <span className="panel-meta">{count}</span>;
}
export function Holdings({ portfolio, onStock, detail, empty, onAll }: AccountListProps & {
  portfolio: Portfolio | null; onStock: (symbol: SymbolCode) => void;
}) {
  const positions = portfolio?.positions ?? [];
  return <section className="overview-panel overview-record-panel">
    <PanelHeading icon={BriefcaseBusiness} title={detail ? 'Open positions' : 'Holdings'}>
      <ListAction onAll={onAll} count={positions.length}/>
    </PanelHeading>
    <FitPager items={detail ? positions : positions.slice(0, 5)} rowHeight={61}
      compactRowHeight={62} empty={empty}
      render={page => <div className="overview-records">{page.map(pos =>
        <div className="record" key={pos.symbol}>
          <span className="asset-cell"><StockMark symbol={pos.symbol}/><span><strong>{pos.symbol}</strong>
            <small>{pos.shares} {pos.short?'short':pos.shares === 1 ? 'share' : 'shares'}</small></span></span>
          {detail && <span className="record-fact"><small>Avg. cost</small><b>{money(pos.costBasisCents / pos.shares)}</b></span>}
          <span className="record-value"><strong>{money(pos.marketValueCents)}</strong>
            <small className={tone(pos.profitCents)}>{signedMoney(pos.profitCents)}</small></span>
          {detail && <button type="button" className="minor-button" aria-label={'Trade ' + pos.symbol}
            onClick={() => onStock(pos.symbol)}>Trade</button>}
        </div>)}</div>}/>
  </section>;
}

export function Rankings({ leaders, userId, detail, empty, onAll }: AccountListProps & {
  leaders: Leader[]; userId?: string;
}) {
  return <section className="overview-panel overview-record-panel">
    <PanelHeading icon={Trophy} title={detail ? 'Global rankings' : 'Top traders'}>
      <ListAction onAll={onAll} count={leaders.length}/>
    </PanelHeading>
    <FitPager items={detail ? leaders : leaders.slice(0, 5)} rowHeight={61}
      compactRowHeight={62} empty={empty}
      render={(page, start) => <div className="overview-records">{page.map((l, i) =>
        <div className="record ranking" key={l.userId}>
          <span className="rank">{String(start + i + 1).padStart(2, '0')}</span>
          <ProfileAvatar url={l.avatarUrl} name={l.displayName}/>
          <span className="rank-name">{l.displayName}{l.userId === userId && <small>You</small>}</span>
          <span className="record-value"><strong>{money(l.equityCents)}</strong>
            <small className={tone(l.changeCents)}>{detail ? signedMoney(l.changeCents) :
              pct(100 * l.changeCents / l.startingCashCents)}</small></span>
        </div>)}</div>}/>
  </section>;
}

export function OrderList({ trades, detail, empty, onAll }: AccountListProps & { trades: Trade[] }) {
  return <section className="overview-panel overview-record-panel">
    <PanelHeading icon={ListFilter} title={detail ? 'Completed orders' : 'Recent activity'}>
      <ListAction onAll={onAll} count={trades.length}/>
    </PanelHeading>
    <FitPager items={detail ? trades : trades.slice(0, 5)} rowHeight={61}
      compactRowHeight={62} empty={empty}
      render={page => <div className="overview-records">{page.map(t =>
        <div className="record order-record" key={t.id}>
          <span className={'order-mark ' + (isBuySide(t.side)?'buy':'sell')}>{isBuySide(t.side) ?
            <ArrowDownLeft size={19}/> : <ArrowUpRight size={19}/>}</span>
          <span className="record-title"><strong>{tradeVerb(t.side)} {t.symbol}</strong>
            <small>{new Date(t.executedAt * 1000).toLocaleString(undefined, {
              month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
            })}</small></span>
          <span className="record-value"><strong>{money(t.shares * t.priceCents)}</strong>
            <small>{t.shares} × {money(t.priceCents)}</small></span>
        </div>)}</div>}/>
  </section>;
}
