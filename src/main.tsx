import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { DiscordSDK } from '@discord/embedded-app-sdk';
import {
  ArrowDownLeft, ArrowLeftRight, ArrowUpRight, BarChart3, CheckCircle2,
  ChevronRight, Clock3, Landmark, LayoutDashboard,
  LoaderCircle, RefreshCw, Search, ShieldCheck, TrendingDown,
  TrendingUp, Trophy, Wallet, X,
} from 'lucide-react';
import type { Leader, Portfolio, Quote, SymbolCode, Trade } from '../shared/stocks';
import { STARTING_CASH_CENTS } from '../shared/stocks';
import './style.css';

type Tab = 'market' | 'portfolio' | 'leaderboard' | 'history';
type Config = { clientId: string | null; provider: 'finnhub'; dataConfigured: boolean; startingCashCents: number };
type Account = { id: string; displayName: string; avatarUrl: string };
type Point = { at: number; priceCents: number };
const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const signedMoney = (cents: number) => `${cents > 0 ? '+' : ''}${money(cents)}`;
const pct = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong';
const short = (value: string, max = 22) => value.length > max ? `${value.slice(0, max)}…` : value;
const links: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'market', label: 'Trade', icon: ArrowLeftRight },
  { id: 'portfolio', label: 'Portfolio', icon: Wallet },
  { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  { id: 'history', label: 'History', icon: Clock3 },
];

async function request<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const payload = await res.json().catch(() => ({})) as T & { error?: string };
  if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
  return payload;
}

function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [token, setToken] = useState('');
  const [authStatus, setAuthStatus] = useState('Connecting to Discord…');
  const [authError, setAuthError] = useState('');
  const [tab, setTab] = useState<Tab>('market');
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<SymbolCode>('AAPL');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [shares, setShares] = useState('1');
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);
  const [search, setSearch] = useState('');
  const [history, setHistory] = useState<Point[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const refresh = useCallback(async (session: string) => {
    if (!session) return;
    const results = await Promise.allSettled([
      request<{ quotes: Quote[] }>('/api/market', session),
      request<{ portfolio: Portfolio }>('/api/portfolio', session),
      request<{ leaders: Leader[] }>('/api/leaderboard', session),
      request<{ trades: Trade[] }>('/api/history', session),
    ]);
    if (results[0].status === 'fulfilled') setQuotes(results[0].value.quotes);
    if (results[1].status === 'fulfilled') setPortfolio(results[1].value.portfolio);
    if (results[2].status === 'fulfilled') setLeaders(results[2].value.leaders);
    if (results[3].status === 'fulfilled') setTrades(results[3].value.trades);
    const first = results.find(r => r.status === 'rejected');
    if (first?.status === 'rejected') setFeedback({ kind: 'error', message: errorMessage(first.reason) });
  }, []);

  useEffect(() => {
    let active = true;
    async function connect() {
      try {
        const settings = await request<Config>('/api/config');
        if (!active) return;
        setConfig(settings);
        if (!settings.clientId || !/^\d{15,22}$/.test(settings.clientId)) throw new Error('Set DISCORD_CLIENT_ID in your Cloudflare Worker secrets.');
        if (window.self === window.top) throw new Error('Launch PaperStreet from the Discord App Launcher.');
        const sdk = new DiscordSDK(settings.clientId);
        await sdk.ready();
        if (!active) return;
        setAuthStatus('Authorizing your Discord account…');
        const { code } = await sdk.commands.authorize({
          client_id: settings.clientId, response_type: 'code', state: '', prompt: 'none',
          scope: ['identify', 'applications.commands'],
        });
        const auth = await request<{ access_token: string; session: string; user: Account }>(
          '/api/auth', undefined, { method: 'POST', body: JSON.stringify({ code }) },
        );
        await sdk.commands.authenticate({ access_token: auth.access_token });
        if (!active) return;
        setToken(auth.session);
        setAccount(auth.user);
        setAuthStatus('Connected');
        setLoading(true);
        await refresh(auth.session);
        if (active) setLoading(false);
      } catch (error) {
        if (active) { setAuthError(errorMessage(error)); setAuthStatus('Not connected'); setLoading(false); }
      }
    }
    void connect();
    return () => { active = false; };
  }, [refresh]);

  useEffect(() => {
    if (!token) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !pending) void refresh(token);
    }, 120_000);
    return () => window.clearInterval(interval);
  }, [token, pending, refresh]);

  useEffect(() => {
    if (!token) { setHistory([]); setHistoryLoading(false); return; }
    let active = true;
    setHistory([]);
    setHistoryLoading(true);
    request<{ points: Point[] }>(`/api/chart?symbol=${encodeURIComponent(selectedSymbol)}`, token)
      .then(({ points }) => { if (active) setHistory(points); })
      .catch(() => { if (active) setHistory([]); })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [selectedSymbol, token, quotes.find(quote => quote.symbol === selectedSymbol)?.fetchedAt]);

  const selected = quotes.find(q => q.symbol === selectedSymbol);
  const quantity = Number(shares);
  const validQuantity = shares.trim() !== '' && Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 100_000;
  const total = selected && validQuantity ? selected.priceCents * quantity : 0;
  const position = portfolio?.positions.find(p => p.symbol === selectedSymbol);
  const canTrade = !!selected && selected.marketOpen && !selected.stale && validQuantity && !!portfolio &&
    (side === 'BUY' ? portfolio.cashCents >= total : (position?.shares ?? 0) >= quantity);
  const shown = useMemo(
    () => quotes.filter(q => `${q.symbol} ${q.name}`.toLowerCase().includes(search.toLowerCase().trim())),
    [quotes, search],
  );
  const gainers = quotes.filter(q => q.changePct > 0).length;
  const returnPercent = ((portfolio?.profitCents ?? 0) / (portfolio?.startingCashCents ?? STARTING_CASH_CENTS)) * 100;
  const refreshNow = () => {
    if (!token || loading) return;
    setFeedback(null);
    setLoading(true);
    void refresh(token).finally(() => setLoading(false));
  };

  async function execute() {
    if (!canTrade || !selected || !token || pending) return;
    setPending(true);
    setFeedback(null);
    try {
      const response = await request<{ fillPriceCents?: number; duplicate?: boolean }>('/api/trade', token, {
        method: 'POST',
        body: JSON.stringify({ symbol: selected.symbol, side, shares: quantity, expectedPriceCents: selected.priceCents, orderId: crypto.randomUUID() }),
      });
      setFeedback({
        kind: 'ok',
        message: response.duplicate ? 'Order already filled.' :
          `${side === 'BUY' ? 'Bought' : 'Sold'} ${quantity} ${selected.symbol} at ${money(response.fillPriceCents ?? selected.priceCents)}.`,
      });
      await refresh(token);
    } catch (error) { setFeedback({ kind: 'error', message: errorMessage(error) }); }
    finally { setPending(false); }
  }

  const title = tab === 'market' ? `Welcome back${account ? `, ${short(account.displayName)}` : ''}` :
    tab === 'portfolio' ? 'Your portfolio' : tab === 'leaderboard' ? 'Top traders' : 'Trade history';
  const subtitle = tab === 'market' ? 'Your trading desk is ready. Stay ahead of the market.' :
    tab === 'portfolio' ? 'Every holding, every gain, all in one place.' :
    tab === 'leaderboard' ? 'Compete on total virtual portfolio equity.' : 'Your 30 most recent orders.';

  return (
    <div className="app-shell">
      <header className="global-header">
        <div className="brand" aria-label="PaperStreet"><span className="brand-mark"><TrendingUp size={27} strokeWidth={3}/></span><span className="brand-words"><strong>Paper<span>Street</span></strong><small>PAPER TRADING GAME</small></span></div>
        <nav className="top-nav" aria-label="Primary navigation">{links.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={`top-link ${tab === id ? 'active' : ''}`} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}><Icon size={17}/><span>{label}</span></button>)}</nav>
        <div className="header-actions">
          <span className="market-mode real" title="Real market quotes. Trades are disabled on stale prices or while the US market is closed."><span className="status-dot"/>REAL STOCK PRICES</span>
          <button type="button" className="icon-button" aria-label="Refresh market and portfolio" title="Refresh" disabled={!token || loading} onClick={refreshNow}><RefreshCw size={17} className={loading ? 'spin' : ''}/></button>
          <div className="user-chip" title={account?.displayName ?? 'Discord user'}><span className="user-avatar">{account?.avatarUrl ? <img src={account.avatarUrl} alt="" referrerPolicy="no-referrer"/> : account?.displayName?.slice(0, 1).toUpperCase() ?? '?'}</span><span className="user-copy"><strong>{short(account?.displayName ?? 'Discord user', 17)}</strong><small><span className="online-dot"/>{authStatus}</small></span></div>
        </div>
      </header>
      <div className="shell-body">
        <aside className="sidebar">
          <div className="sidebar-label">YOUR WORKSPACE</div>
          <nav aria-label="Workspace navigation">
            <button type="button" className={`nav-button ${tab === 'market' ? 'active' : ''}`} onClick={() => setTab('market')}><LayoutDashboard size={18}/><span>Dashboard</span></button>
            {links.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={`nav-button ${tab === id && id !== 'market' ? 'active' : ''}`} onClick={() => setTab(id)}><Icon size={18}/><span>{id === 'market' ? 'Trade stocks' : label}</span></button>)}
          </nav>
          <div className="sidebar-promo"><span className="promo-icon"><Trophy size={21}/></span><strong>Every trade counts.</strong><p>Build your portfolio and climb the global leaderboard.</p><button type="button" onClick={() => setTab('leaderboard')}>View rankings <ChevronRight size={15}/></button></div>
          <div className="sidebar-foot"><ShieldCheck size={13}/> Virtual money only</div>
        </aside>
        <main className="main-content">
          <div className="content-wrap">
            <div className="headline"><div><div className="eyebrow">PAPERSTREET EXCHANGE <span> / </span> {tab.toUpperCase()}</div><h1>{title}</h1><p>{subtitle}</p></div><span className="connection-pill"><span className={`status-dot ${account ? '' : 'connecting'}`}/>{authStatus}</span></div>
            {!account ? <section className="welcome-panel"><div className="welcome-icon"><BarChart3 size={30}/></div><h2>Start with {money(STARTING_CASH_CENTS)}</h2><p>Connect through the Discord App Launcher to start trading stocks using virtual cash.</p><div className="auth-status" role="status">{authError || authStatus}</div><small>PaperStreet is a game. No real money is exchanged.</small></section> : <>
              {!config?.dataConfigured && <div className="feedback error" role="alert"><span><X size={17}/> Market data is not configured. The operator must add FINNHUB_API_KEY as a Cloudflare Worker secret.</span></div>}
              <div className="stats-grid">
                <Stat title="PORTFOLIO VALUE" value={portfolio ? money(portfolio.equityCents) : '—'} sub={portfolio ? signedMoney(portfolio.profitCents) : 'Awaiting real quotes'} icon={<Wallet size={19}/>} subClass={(portfolio?.profitCents ?? 0) >= 0 ? 'positive' : 'negative'}/>
                <Stat title="CASH BALANCE" value={portfolio ? money(portfolio.cashCents) : '—'} sub="Available buying power" icon={<Landmark size={19}/>}/>
                <Stat title="TOTAL HOLDINGS" value={portfolio ? money(portfolio.investedCents) : '—'} sub={`${portfolio?.positions.length ?? 0} open positions`} icon={<BarChart3 size={19}/>}/>
                <Stat title="ALL TIME RETURN" value={portfolio ? pct(returnPercent) : '—'} sub={`${gainers} of ${quotes.length} assets rising`} icon={<TrendingUp size={19}/>} valueClass={returnPercent >= 0 ? 'positive' : 'negative'}/>
              </div>
              {feedback && <div className={`feedback ${feedback.kind}`} role="status"><span>{feedback.kind === 'ok' ? <CheckCircle2 size={17}/> : <X size={17}/>} {feedback.message}</span><button type="button" aria-label="Dismiss notice" onClick={() => setFeedback(null)}><X size={16}/></button></div>}
              {tab === 'market' ? <div className="dashboard-grid">
                <div className="dashboard-left">
                  <section className="panel chart-panel" aria-label="Selected stock details">
                    <div className="chart-top"><div className="symbol-badge">{selectedSymbol.slice(0, 2)}</div><div className="chart-identity"><strong>{selected?.symbol ?? selectedSymbol}</strong><span>{selected?.name ?? 'Loading market…'}</span></div><span className="chart-source" title={selected ? `Provider last trade at ${new Date(selected.fetchedAt * 1000).toLocaleString()}` : undefined}>FINNHUB · LAST TRADE</span></div>
                    <div className="chart-price"><strong>{selected ? money(selected.priceCents) : '—'}</strong><span className={selected && selected.changePct < 0 ? 'negative' : 'positive'}>{selected ? <>{selected.changePct >= 0 ? <TrendingUp size={15}/> : <TrendingDown size={15}/>} {pct(selected.changePct)} vs. previous close</> : 'Waiting for prices'}</span></div>
                    <PriceChart points={history} loading={historyLoading}/>
                    <div className="chart-footer"><span>OBSERVED REAL QUOTES · PAST 12 HOURS</span><span>{selected?.stale ? 'STALE QUOTE' : selected && !selected.marketOpen ? 'MARKET CLOSED' : 'USD / SHARE'}</span></div>
                  </section>
                  <section className="panel market-panel" aria-label="Market overview">
                    <div className="panel-heading"><div><h2>Market overview</h2><p>Select a stock to view or trade</p></div><label className="search-field"><Search size={15}/><input aria-label="Search stocks" placeholder="Find a stock" value={search} onChange={event => setSearch(event.target.value)}/></label></div>
                    <div className="stock-head"><span>ASSET</span><span>PRICE</span><span>CHANGE</span></div>
                    <div className="stock-list">{shown.map(quote => <button type="button" key={quote.symbol} className={`stock-row ${selectedSymbol === quote.symbol ? 'selected' : ''}`} aria-pressed={selectedSymbol === quote.symbol} onClick={() => setSelectedSymbol(quote.symbol)}><span className="stock-name"><span className="ticker-icon">{quote.symbol.slice(0, 2)}</span><span><strong>{quote.symbol}</strong><small>{quote.name}</small></span></span><strong className="stock-price">{money(quote.priceCents)}</strong><span className={`change ${quote.changePct >= 0 ? 'positive' : 'negative'}`}>{pct(quote.changePct)}</span></button>)}{!shown.length && <div className="empty">{quotes.length ? 'No stocks match that search.' : 'Market data is unavailable.'}</div>}</div>
                  </section>
                </div>
                <TradeTicket selected={selected} side={side} setSide={setSide} shares={shares} setShares={setShares} total={total} positionShares={position?.shares ?? 0} canTrade={canTrade} pending={pending} execute={execute} portfolio={portfolio}/>
                <div className="dashboard-rail">
                  <section className="panel snapshot-panel"><div className="panel-heading"><h2><Wallet size={18}/> My portfolio</h2><button type="button" className="subtle-link" onClick={() => setTab('portfolio')}>View all <ChevronRight size={14}/></button></div><div className="snapshot-equity"><strong>{portfolio ? money(portfolio.equityCents) : '—'}</strong><span className={returnPercent >= 0 ? 'positive' : 'negative'}>{portfolio ? `${pct(returnPercent)} all time` : 'Waiting for prices'}</span></div><div className="mini-stats"><span>Cash <strong>{money(portfolio?.cashCents ?? 0)}</strong></span><span>Invested <strong>{money(portfolio?.investedCents ?? 0)}</strong></span></div><div className="rail-subhead"><span>TOP HOLDINGS</span><span>VALUE</span></div><div className="holding-list">{portfolio?.positions.slice(0, 5).map(p => <div key={p.symbol} className="holding-row"><span className="holding-name"><span className="ticker-icon tiny">{p.symbol.slice(0, 2)}</span><span><strong>{p.symbol}</strong><small>{p.shares} shares</small></span></span><span className="holding-value"><strong>{money(p.marketValueCents)}</strong><small className={p.profitCents >= 0 ? 'positive' : 'negative'}>{signedMoney(p.profitCents)}</small></span></div>)}{!portfolio?.positions.length && <div className="rail-empty">Your holdings will appear here.</div>}</div></section>
                  <section className="panel leader-panel"><div className="panel-heading"><h2><Trophy size={19}/> Leaderboard</h2><button type="button" className="subtle-link" onClick={() => setTab('leaderboard')}>Top 25 <ChevronRight size={14}/></button></div><div className="leaderboard-list">{leaders.slice(0, 6).map((leader, i) => <div key={leader.userId} className={`leader-row ${leader.userId === account.id ? 'self' : ''}`}><span className="rank">{i + 1}</span><span className="leader-avatar">{leader.displayName.slice(0, 1).toUpperCase()}</span><span className="leader-name">{short(leader.displayName, 16)}{leader.userId === account.id && <small> YOU</small>}</span><span className={`leader-return ${leader.changeCents >= 0 ? 'positive' : 'negative'}`}>{pct((leader.changeCents / leader.startingCashCents) * 100)}</span></div>)}{!leaders.length && <div className="rail-empty">No rankings yet.</div>}</div></section>
                </div>
              </div> : <section className="panel details-panel">
                <div className="panel-heading details-heading"><div><h2>{tab === 'portfolio' ? 'Open positions' : tab === 'leaderboard' ? 'Global rankings' : 'Executed orders'}</h2><p>{tab === 'portfolio' ? 'Market value and cost basis for your investments.' : tab === 'leaderboard' ? 'Ranked by total portfolio equity, including virtual cash.' : 'Your latest completed market orders.'}</p></div><span className="count-pill">{tab === 'portfolio' ? `${portfolio?.positions.length ?? 0} POSITIONS` : tab === 'leaderboard' ? 'TOP 25' : `${trades.length} TRADES`}</span></div>
                {tab === 'portfolio' ? <div className="responsive-table"><table><thead><tr><th>Asset</th><th>Shares</th><th>Average cost</th><th>Market value</th><th>Profit / loss</th><th></th></tr></thead><tbody>{portfolio?.positions.map(p => <tr key={p.symbol}><td><strong>{p.symbol}</strong><small>{p.quote.name}</small></td><td>{p.shares}</td><td>{money(Math.round(p.costBasisCents / p.shares))}</td><td>{money(p.marketValueCents)}</td><td className={p.profitCents >= 0 ? 'positive' : 'negative'}>{signedMoney(p.profitCents)}</td><td><button type="button" className="small-action" onClick={() => { setSelectedSymbol(p.symbol); setSide('SELL'); setTab('market'); }}>Trade <ArrowUpRight size={14}/></button></td></tr>)}</tbody></table>{!portfolio?.positions.length && <div className="empty">No holdings yet. Visit Trade to place your first order.</div>}</div> : tab === 'leaderboard' ? <div className="full-leaderboard">{leaders.map((leader, i) => <div key={leader.userId} className={`full-leader-row ${leader.userId === account.id ? 'self' : ''}`}><span className="rank">#{i + 1}</span><span className="leader-avatar">{leader.displayName.slice(0, 1).toUpperCase()}</span><span className="full-leader-name"><strong>{leader.displayName}</strong>{leader.userId === account.id && <small>YOU</small>}</span><span className="full-leader-value"><strong>{money(leader.equityCents)}</strong><small className={leader.changeCents >= 0 ? 'positive' : 'negative'}>{signedMoney(leader.changeCents)} all time</small></span></div>)}{!leaders.length && <div className="empty">Rankings will appear when players join.</div>}</div> : <div className="responsive-table"><table><thead><tr><th>Order</th><th>Symbol</th><th>Shares</th><th>Fill price</th><th>Total</th><th>Time</th></tr></thead><tbody>{trades.map(trade => <tr key={trade.id}><td><span className={`order-side ${trade.side === 'BUY' ? 'buy' : 'sell'}`}>{trade.side === 'BUY' ? <ArrowDownLeft size={14}/> : <ArrowUpRight size={14}/>} {trade.side}</span></td><td><strong>{trade.symbol}</strong></td><td>{trade.shares}</td><td>{money(trade.priceCents)}</td><td>{money(trade.shares * trade.priceCents)}</td><td>{new Date(trade.executedAt * 1000).toLocaleString()}</td></tr>)}</tbody></table>{!trades.length && <div className="empty">No trades yet. Your order history will appear here.</div>}</div>}
              </section>}
              <footer className="app-footer"><span>PaperStreet is a paper trading game. No real securities or money are exchanged.</span><span>Real provider quotes may be delayed. Orders require an open US trading session and a fresh quote.</span></footer>
            </>}
          </div>
        </main>
      </div>
    </div>
  );
}

function Stat({ title, value, sub, icon, valueClass = '', subClass = '' }: { title: string; value: string; sub: string; icon: ReactNode; valueClass?: string; subClass?: string }) {
  return <div className="stat-card"><div className="stat-top"><span>{title}</span><span className="stat-icon">{icon}</span></div><strong className={valueClass}>{value}</strong><small className={subClass}>{sub}</small></div>;
}

function PriceChart({ points, loading }: { points: Point[]; loading: boolean }) {
  if (loading || points.length < 2) return <div className="chart-placeholder"><BarChart3 size={25}/><span>{loading ? 'Loading recorded stock quotes…' : 'Real price history is accumulating. This chart needs at least two observations.'}</span></div>;
  const min = Math.min(...points.map(p => p.priceCents));
  const max = Math.max(...points.map(p => p.priceCents));
  const spread = Math.max(max - min, 1);
  const coordinates = points.map((p, index) => ({ x: (index / (points.length - 1)) * 1000, y: 180 - ((p.priceCents - min) / spread) * 150 }));
  const line = coordinates.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `M ${coordinates.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')} L 1000 206 L 0 206 Z`;
  const rising = points.at(-1)!.priceCents >= points[0].priceCents;
  return <div className="price-chart"><svg viewBox="0 0 1000 208" preserveAspectRatio="none" role="img" aria-label={`Observed real stock prices from ${money(points[0].priceCents)} to ${money(points.at(-1)!.priceCents)}`}>
    {[0, 1, 2, 3, 4].map(i => <line key={`h${i}`} x1="0" y1={i * 50 + 4} x2="1000" y2={i * 50 + 4} className="gridline"/>)}
    {[1, 2, 3, 4, 5].map(i => <line key={`v${i}`} x1={i * 166.67} y1="0" x2={i * 166.67} y2="208" className="gridline"/>)}
    <path d={area} fill={rising ? '#0b3023' : '#351d25'}/>
    <polyline points={line} className={rising ? 'chart-line up' : 'chart-line down'}/>
  </svg><div className="chart-axis"><span>12h ago</span><span>9h</span><span>6h</span><span>3h</span><span>Now</span></div></div>;
}

function TradeTicket({ selected, side, setSide, shares, setShares, total, positionShares, canTrade, pending, execute, portfolio }: {
  selected?: Quote; side: 'BUY' | 'SELL'; setSide: (value: 'BUY' | 'SELL') => void; shares: string; setShares: (value: string) => void;
  total: number; positionShares: number; canTrade: boolean; pending: boolean; execute: () => void; portfolio: Portfolio | null;
}) {
  const quantity = Number(shares);
  const max = side === 'BUY' && selected ? Math.min(100_000, Math.floor((portfolio?.cashCents ?? 0) / selected.priceCents)) : Math.min(100_000, positionShares);
  return <section className="panel trade-panel"><div className="panel-heading"><h2><ArrowLeftRight size={19}/> Trade {selected?.symbol ?? 'stock'}</h2><span className="trade-tag">MARKET ORDER</span></div><div className="ticket-body">
    <div className="side-selector"><button type="button" className={side === 'BUY' ? 'current buy' : ''} aria-pressed={side === 'BUY'} onClick={() => setSide('BUY')}>Buy</button><button type="button" className={side === 'SELL' ? 'current sell' : ''} aria-pressed={side === 'SELL'} onClick={() => setSide('SELL')}>Sell</button></div>
    <div className="ticket-asset"><span className="ticket-asset-name"><span className="ticker-icon">{selected?.symbol.slice(0, 2) ?? '??'}</span><span><strong>{selected?.symbol ?? 'Select stock'}</strong><small>{selected?.name ?? 'Choose an asset'}</small></span></span><strong>{selected ? money(selected.priceCents) : '—'}</strong></div>
    <label className="field-label" htmlFor="shares">SHARES <span>{side === 'BUY' ? 'AVAILABLE CASH' : 'OWNED'}: {side === 'BUY' ? money(portfolio?.cashCents ?? 0) : positionShares}</span></label>
    <div className="quantity-wrapper"><input id="shares" type="number" inputMode="numeric" min="1" max="100000" step="1" value={shares} onChange={event => setShares(event.target.value)}/><span>SHARES</span></div>
    <div className="quantity-presets">{[1, 5, 10].map(n => <button type="button" key={n} onClick={() => setShares(String(n))} disabled={n > max}>{n}</button>)}<button type="button" onClick={() => setShares(String(max))} disabled={max < 1}>Max</button></div>
    <div className="ticket-breakdown"><div><span>Price per share</span><strong>{selected ? money(selected.priceCents) : '—'}</strong></div><div><span>Shares owned</span><strong>{positionShares}</strong></div><div className="ticket-total"><span>Estimated {side === 'BUY' ? 'cost' : 'proceeds'}</span><strong>{Number.isSafeInteger(quantity) && quantity >= 1 ? money(total) : '—'}</strong></div></div>
    <button type="button" className={`execute-button ${side.toLowerCase()}`} disabled={!canTrade || pending} onClick={execute}>{pending ? <LoaderCircle size={17} className="spin"/> : side === 'BUY' ? <ArrowDownLeft size={17}/> : <ArrowUpRight size={17}/>} {pending ? 'Processing…' : `${side === 'BUY' ? 'Buy' : 'Sell'} ${selected?.symbol ?? 'shares'}`}</button>
    <p className="ticket-disclaimer">{selected && !selected.marketOpen ? 'US stock market closed. Orders resume at 9:30 AM ET on the next trading day.' : selected?.stale ? 'Real market quote is stale. Trading is temporarily paused.' : 'Orders use server validated real quotes, possibly delayed. Virtual trades only.'}</p>
  </div></section>;
}

createRoot(document.getElementById('root')!).render(<App/>);
