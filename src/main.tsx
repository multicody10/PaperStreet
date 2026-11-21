import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { DiscordSDK } from '@discord/embedded-app-sdk';
import {
  ArrowDownLeft, ArrowLeft, ArrowLeftRight, ArrowUpRight, BarChart3, CheckCircle2,
  ChevronRight, Clock3, Landmark, LayoutDashboard,
  LoaderCircle, RefreshCw, Search, ShieldCheck, TrendingDown,
  TrendingUp, Trophy, Wallet, X,
} from 'lucide-react';
import type { ChartHistory, HistoryRange, Leader, Portfolio, Quote, SymbolCode, Trade } from '../shared/stocks';
import { HISTORY_RANGES, STARTING_CASH_CENTS } from '../shared/stocks';
import { appHash, parseAppHash, type Page, type View } from './navigation';
import { DayRange, money, PriceChart } from './PriceChart';
import './style.css';
import './mobile.css';

type Config = { clientId: string | null; provider: 'finnhub'; dataConfigured: boolean; startingCashCents: number };
type Account = { id: string; displayName: string; avatarUrl: string };
const signedMoney = (cents: number) => `${cents > 0 ? '+' : ''}${money(cents)}`;
const pct = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong';
const short = (value: string, max = 22) => value.length > max ? `${value.slice(0, max)}…` : value;
const links: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'trade', label: 'Trade', icon: ArrowLeftRight },
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
  const mainRef = useRef<HTMLElement | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [token, setToken] = useState('');
  const [authStatus, setAuthStatus] = useState('Connecting to Discord…');
  const [authError, setAuthError] = useState('');
  const [tab, setTab] = useState<View>(() => parseAppHash(window.location.hash).view);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<SymbolCode>(() => parseAppHash(window.location.hash).symbol);
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [shares, setShares] = useState('1');
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);
  const [search, setSearch] = useState('');
  const [history, setHistory] = useState<{ key: string; data?: ChartHistory; error?: string }>();
  const [historyRange, setHistoryRange] = useState<HistoryRange>('1W');
  const historyKey = `${selectedSymbol}:${historyRange}`;
  const currentHistory = history?.key === historyKey ? history : undefined;

  function goToPage(page: Page) {
    setTab(page);
    window.history.pushState(null, '', appHash(page));
  }
  function openStock(symbol: SymbolCode, nextSide: 'BUY' | 'SELL' = 'BUY') {
    setSelectedSymbol(symbol);
    setSide(nextSide);
    setShares('1');
    setTab('stock');
    window.history.pushState(null, '', appHash('stock', symbol));
  }
  useEffect(() => {
    const syncRoute = () => {
      const route = parseAppHash(window.location.hash);
      setTab(route.view);
      setSelectedSymbol(route.symbol);
    };
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  // Mobile pages share a single scroll container; open each new view at the top.
  useEffect(() => { mainRef.current?.scrollTo({ top: 0, behavior: 'auto' }); }, [tab, selectedSymbol]);

  const refresh = useCallback(async (session: string, view: View) => {
    if (!session) return;
    // Only load data consumed by the current page, saving Worker requests and D1 reads.
    const jobs: Promise<void>[] = [];
    if (view === 'dashboard' || view === 'trade' || view === 'stock')
      jobs.push(request<{ quotes: Quote[] }>('/api/market', session).then(({ quotes }) => setQuotes(quotes)));
    if (view === 'dashboard' || view === 'portfolio' || view === 'stock')
      jobs.push(request<{ portfolio: Portfolio }>('/api/portfolio', session).then(({ portfolio }) => setPortfolio(portfolio)));
    if (view === 'dashboard' || view === 'leaderboard')
      jobs.push(request<{ leaders: Leader[] }>('/api/leaderboard', session).then(({ leaders }) => setLeaders(leaders)));
    if (view === 'dashboard' || view === 'history')
      jobs.push(request<{ trades: Trade[] }>('/api/history', session).then(({ trades }) => setTrades(trades)));
    const results = await Promise.allSettled(jobs);
    const failure = results.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected')
      setFeedback({ kind: 'error', message: errorMessage(failure.reason) });
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
        // The page-scoped effect below loads initial data once authentication completes.
      } catch (error) {
        if (active) { setAuthError(errorMessage(error)); setAuthStatus('Not connected'); setLoading(false); }
      }
    }
    void connect();
    return () => { active = false; };
  }, [refresh]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    setLoading(true);
    void refresh(token, tab).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, tab, refresh]);

  useEffect(() => {
    if (!token) return;
    const period = tab === 'trade' || tab === 'stock' ? 120_000 : 300_000;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !pending) void refresh(token, tab);
    }, period);
    return () => window.clearInterval(interval);
  }, [token, pending, tab, refresh]);

  useEffect(() => {
    if (!token || tab !== 'stock') return;
    const controller = new AbortController();
    request<ChartHistory>(`/api/chart?symbol=${selectedSymbol}&range=${historyRange}`, token, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setHistory({ key: historyKey, data }); })
      .catch(error => { if (!controller.signal.aborted) setHistory({ key: historyKey, error: errorMessage(error) }); });
    return () => controller.abort();
  }, [selectedSymbol, historyRange, historyKey, tab, token, quotes.find(quote => quote.symbol === selectedSymbol)?.fetchedAt]);

  const selected = quotes.find(q => q.symbol === selectedSymbol);
  const quantity = Number(shares);
  const validQuantity = shares.trim() !== '' && Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 100_000;
  const total = selected && validQuantity ? selected.priceCents * quantity : 0;
  const position = portfolio?.positions.find(p => p.symbol === selectedSymbol);
  const canTrade = !!selected && !selected.stale && validQuantity && !!portfolio &&
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
    void refresh(token, tab).finally(() => setLoading(false));
  };

  async function execute() {
    if (tab !== 'stock' || !canTrade || !selected || !token || pending) return;
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
      await refresh(token, 'stock');
    } catch (error) { setFeedback({ kind: 'error', message: errorMessage(error) }); }
    finally { setPending(false); }
  }

  const title = tab === 'dashboard' ? `Welcome back${account ? `, ${short(account.displayName)}` : ''}` :
    tab === 'trade' ? 'Explore stocks' :
    tab === 'stock' ? `${selected?.name ?? selectedSymbol} · ${selectedSymbol}` :
    tab === 'portfolio' ? 'Your portfolio' : tab === 'leaderboard' ? 'Top traders' : 'Trade history';
  const subtitle = tab === 'dashboard' ? 'Your portfolio, performance and recent activity at a glance.' :
    tab === 'trade' ? 'Browse real market quotes and open a stock to trade.' :
    tab === 'stock' ? 'Price history, quote details and virtual order entry.' :
    tab === 'portfolio' ? 'Every holding, every gain, all in one place.' :
    tab === 'leaderboard' ? 'Compete on total virtual portfolio equity.' : 'Your 30 most recent orders.';

  return (
    <div className="app-shell">
      <header className="global-header">
        <div className="brand" aria-label="PaperStreet"><span className="brand-mark"><TrendingUp size={27} strokeWidth={3}/></span><span className="brand-words"><strong>Paper<span>Street</span></strong><small>PAPER TRADING GAME</small></span></div>
        <nav className="top-nav" aria-label="Primary navigation">{links.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={'top-link ' + (tab === id || (tab === 'stock' && id === 'trade') ? 'active' : '')} aria-current={tab === id || (tab === 'stock' && id === 'trade') ? 'page' : undefined} onClick={() => goToPage(id)}><Icon size={17}/><span>{label}</span></button>)}</nav>
        <div className="header-actions">
          <span className="market-mode real" title="Virtual trading runs 24/7. Finnhub prices may remain unchanged after exchange hours; quotes that are too old cannot be traded."><span className="status-dot"/>REAL STOCK PRICES</span>
          <button type="button" className="icon-button" aria-label="Refresh market and portfolio" title="Refresh" disabled={!token || loading} onClick={refreshNow}><RefreshCw size={17} className={loading ? 'spin' : ''}/></button>
          <div className="user-chip" title={account?.displayName ?? 'Discord user'}><ProfileAvatar className="user-avatar" url={account?.avatarUrl} name={account?.displayName ?? 'Discord user'}/><span className="user-copy"><strong>{short(account?.displayName ?? 'Discord user', 17)}</strong><small><span className="online-dot"/>{authStatus}</small></span></div>
        </div>
      </header>
      <div className="shell-body">
        <aside className="sidebar">
          <div className="sidebar-label">YOUR WORKSPACE</div>
          <nav aria-label="Workspace navigation">
            {links.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={'nav-button ' + (tab === id || (tab === 'stock' && id === 'trade') ? 'active' : '')} aria-current={tab === id || (tab === 'stock' && id === 'trade') ? 'page' : undefined} onClick={() => goToPage(id)}><Icon size={18}/><span>{label}</span></button>)}
          </nav>
          <div className="sidebar-promo"><span className="promo-icon"><Trophy size={21}/></span><strong>Every trade counts.</strong><p>Build your portfolio and climb the global leaderboard.</p><button type="button" onClick={() => goToPage('leaderboard')}>View rankings <ChevronRight size={15}/></button></div>
          <div className="sidebar-foot"><ShieldCheck size={13}/> Virtual money only</div>
        </aside>
        <main className="main-content" ref={mainRef}>
          <div className="content-wrap">
            <div className="headline"><div><div className="eyebrow">PAPERSTREET EXCHANGE <span> / </span> {tab === 'stock' ? 'TRADE / ' + selectedSymbol : tab.toUpperCase()}</div><h1>{title}</h1><p>{subtitle}</p></div><span className="connection-pill"><span className={`status-dot ${account ? '' : 'connecting'}`}/>{authStatus}</span></div>
            {!account ? <section className="welcome-panel"><div className="welcome-icon"><BarChart3 size={30}/></div><h2>Start with {money(STARTING_CASH_CENTS)}</h2><p>Connect through the Discord App Launcher to start trading stocks using virtual cash.</p><div className="auth-status" role="status">{authError || authStatus}</div><small>PaperStreet is a game. No real money is exchanged.</small></section> : <>
              {!config?.dataConfigured && <div className="feedback error" role="alert"><span><X size={17}/> Market data is not configured. The operator must add FINNHUB_API_KEY as a Cloudflare Worker secret.</span></div>}
              {tab === 'dashboard' && <div className="stats-grid">
                <Stat title="PORTFOLIO VALUE" value={portfolio ? money(portfolio.equityCents) : '—'} sub={portfolio ? signedMoney(portfolio.profitCents) : 'Awaiting real quotes'} icon={<Wallet size={19}/>} subClass={(portfolio?.profitCents ?? 0) >= 0 ? 'positive' : 'negative'}/>
                <Stat title="CASH BALANCE" value={portfolio ? money(portfolio.cashCents) : '—'} sub="Available buying power" icon={<Landmark size={19}/>}/>
                <Stat title="TOTAL HOLDINGS" value={portfolio ? money(portfolio.investedCents) : '—'} sub={`${portfolio?.positions.length ?? 0} open positions`} icon={<BarChart3 size={19}/>}/>
                <Stat title="ALL TIME RETURN" value={portfolio ? pct(returnPercent) : '—'} sub={`${gainers} of ${quotes.length} assets rising`} icon={<TrendingUp size={19}/>} valueClass={returnPercent >= 0 ? 'positive' : 'negative'}/>
              </div>}
              {feedback && <div className={`feedback ${feedback.kind}`} role="status"><span>{feedback.kind === 'ok' ? <CheckCircle2 size={17}/> : <X size={17}/>} {feedback.message}</span><button type="button" aria-label="Dismiss notice" onClick={() => setFeedback(null)}><X size={16}/></button></div>}

              {tab === 'dashboard' ? <div className="overview-layout" aria-label="Read-only portfolio dashboard">
                <section className="panel overview-positions">
                  <div className="panel-heading"><div><h2><Wallet size={18}/> Your holdings</h2><p>Current positions and unrealized returns</p></div><button type="button" className="subtle-link" onClick={() => goToPage('portfolio')}>View portfolio <ChevronRight size={14}/></button></div>
                  <div className="holding-list">{portfolio?.positions.map(p => <div key={p.symbol} className="holding-row"><span className="holding-name"><span className="ticker-icon tiny">{p.symbol.slice(0, 2)}</span><span><strong>{p.symbol}</strong><small>{p.shares} shares · {p.quote.name}</small></span></span><span className="holding-value"><strong>{money(p.marketValueCents)}</strong><small className={p.profitCents >= 0 ? 'positive' : 'negative'}>{signedMoney(p.profitCents)}</small></span></div>)}{!portfolio?.positions.length && <div className="rail-empty">No positions yet. Portfolio holdings will appear here.</div>}</div>
                </section>
                <section className="panel overview-leaders leader-panel">
                  <div className="panel-heading"><h2><Trophy size={18}/> Top traders</h2><button type="button" className="subtle-link" onClick={() => goToPage('leaderboard')}>Leaderboard <ChevronRight size={14}/></button></div>
                  <div className="leaderboard-list">{leaders.slice(0, 6).map((leader, i) => <div key={leader.userId} className={'leader-row ' + (leader.userId === account.id ? 'self' : '')}><span className="rank">{i + 1}</span><ProfileAvatar className="leader-avatar" url={leader.avatarUrl} name={leader.displayName}/><span className="leader-name">{short(leader.displayName, 16)}{leader.userId === account.id && <small> YOU</small>}</span><span className={leader.changeCents >= 0 ? 'leader-return positive' : 'leader-return negative'}>{pct((leader.changeCents / leader.startingCashCents) * 100)}</span></div>)}{!leaders.length && <div className="rail-empty">Rankings will appear when players join.</div>}</div>
                </section>
                <section className="panel overview-activity">
                  <div className="panel-heading"><div><h2><Clock3 size={18}/> Recent activity</h2><p>Your most recent completed orders</p></div><button type="button" className="subtle-link" onClick={() => goToPage('history')}>History <ChevronRight size={14}/></button></div>
                  <div className="activity-list">{trades.slice(0, 5).map(order => <div className="activity-row" key={order.id}><span><span className={'activity-action ' + order.side.toLowerCase()}>{order.side}</span><span><strong>{order.shares} {order.symbol} shares</strong><small>{new Date(order.executedAt * 1000).toLocaleString()}</small></span></span><span><strong>{money(order.priceCents * order.shares)}</strong><small>{money(order.priceCents)} per share</small></span></div>)}{!trades.length && <div className="rail-empty">Your completed virtual orders will appear here.</div>}</div>
                </section>
                <section className="panel overview-pulse">
                  <div className="panel-heading"><div><h2><BarChart3 size={18}/> Market snapshot</h2><p>Informational overview · Finnhub quotes</p></div></div>
                  <div className="pulse-summary"><div className="pulse-stat"><span>Advancing</span><strong className="positive">{gainers}</strong></div><div className="pulse-stat"><span>Declining</span><strong className="negative">{quotes.filter(q => q.changePct < 0).length}</strong></div></div>
                  <div className="pulse-list">{[...quotes].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 3).map(q => <div key={q.symbol} className="pulse-row"><strong>{q.symbol} <small>{money(q.priceCents)}</small></strong><span className={q.changePct >= 0 ? 'change positive' : 'change negative'}>{pct(q.changePct)}</span></div>)}{!quotes.length && <div className="rail-empty">Market data is unavailable.</div>}</div>
                </section>
              </div> : tab === 'trade' ? <div className="trade-overview" aria-label="Market overview and stock selection">
                <section className="panel market-panel trade-universe">
                  <div className="panel-heading"><div><h2><BarChart3 size={18}/> Stock market</h2><p>{quotes.length} available quotes · Select a company to view its stock page</p></div><label className="search-field"><Search size={15}/><input aria-label="Search market symbols" placeholder="Search stocks" value={search} onChange={event => setSearch(event.target.value)}/></label></div>
                  <div className="stock-head"><span>COMPANY</span><span>LAST PRICE</span><span>DAY RANGE</span><span>CHANGE</span></div>
                  <div className="stock-list">{shown.map(quote => <button type="button" key={quote.symbol} className="stock-row" aria-label={'Open ' + quote.name + ' (' + quote.symbol + ') stock page'} onClick={() => openStock(quote.symbol)}><span className="stock-name"><span className="ticker-icon">{quote.symbol.slice(0, 2)}</span><span><strong>{quote.symbol}</strong><small>{quote.name}{quote.stale ? ' · Stale quote' : ''}</small></span></span><strong className="stock-price">{money(quote.priceCents)}</strong><span className="day-range-cell"><DayRange quote={quote}/></span><span className={quote.changePct >= 0 ? 'change positive' : 'change negative'}>{pct(quote.changePct)}</span></button>)}{!shown.length && <div className="empty">{quotes.length ? 'No stocks match your search.' : 'Real market quotes are unavailable.'}</div>}</div>
                  <div className="read-only-note">Select a stock to see its price history and place an order. No orders execute from this list.</div>
                </section>
                <div className="trade-insights">
                  <section className="panel trade-breadth">
                    <div className="panel-heading"><h2><TrendingUp size={18}/> Market overview</h2><span className="count-pill">{quotes.length} SYMBOLS</span></div>
                    <div className="pulse-summary"><div className="pulse-stat"><span>Advancing</span><strong className="positive">{gainers}</strong></div><div className="pulse-stat"><span>Declining</span><strong className="negative">{quotes.filter(q => q.changePct < 0).length}</strong></div></div>
                    <p className="market-brief">Prices are from <strong>Finnhub</strong>. The virtual exchange accepts orders 24/7 using verified prices; stock prices may stop moving after exchange hours.</p>
                  </section>
                  <section className="panel trade-movers">
                    <div className="panel-heading"><h2><BarChart3 size={18}/> Biggest movers</h2><span className="count-pill">VS. PREV. CLOSE</span></div>
                    <div className="panel-scroll">{[...quotes].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 7).map(quote => <button type="button" className="market-mover" key={quote.symbol} onClick={() => openStock(quote.symbol)}><span><strong>{quote.symbol}</strong><small>{quote.name}</small></span><span className={quote.changePct >= 0 ? 'change positive' : 'change negative'}>{pct(quote.changePct)}</span></button>)}{!quotes.length && <div className="rail-empty">No quote data available.</div>}</div>
                  </section>
                </div>
              </div> : tab === 'stock' ? <div className="stock-workspace" aria-label={'Stock details and trading for ' + selectedSymbol}>
                <div className="stock-research">
                  <div className="stock-nav"><button type="button" className="stock-back" onClick={() => goToPage('trade')}><ArrowLeft size={16}/> Back to all stocks</button><span>INDIVIDUAL STOCK · {selectedSymbol}</span></div>
                  <section className="panel chart-panel" aria-label={selectedSymbol + ' price history'}>
                    <div className="chart-top"><div className="symbol-badge">{selectedSymbol.slice(0, 2)}</div><div className="chart-identity"><strong>{selectedSymbol}</strong><span>{selected?.name ?? 'Loading verified quote…'}</span></div><span className="chart-source" title={selected ? 'Provider last trade: ' + new Date(selected.fetchedAt * 1000).toLocaleString() : undefined}>FINNHUB · LAST TRADE</span></div>
                    <div className="chart-price"><strong>{selected ? money(selected.priceCents) : '—'}</strong><span className={selected && selected.changePct < 0 ? 'negative' : 'positive'}>{selected ? <>{selected.changePct >= 0 ? <TrendingUp size={15}/> : <TrendingDown size={15}/>} {pct(selected.changePct)} vs. previous close</> : 'Waiting for prices'}</span></div>
                    <div className="chart-range-bar" role="group" aria-label="Select stock history time range">
                      {HISTORY_RANGES.map(range => <button key={range} type="button" className={historyRange === range ? 'active' : ''} aria-pressed={historyRange === range} onClick={() => setHistoryRange(range)}>{range}</button>)}
                    </div>
                    <PriceChart key={historyKey} history={currentHistory?.data} quote={selected} range={historyRange} error={currentHistory?.error}/>
                  </section>
                  <section className="panel" aria-label="Stock quote details"><div className="stock-facts">
                    <div className="stock-fact"><span>SESSION RANGE</span>{selected?.sessionBar ? <DayRange quote={selected}/> : <strong>—</strong>}</div>
                    <div className="stock-fact"><span>PREVIOUS CLOSE</span><strong>{selected ? money(selected.previousCloseCents) : '—'}</strong><small>US dollars per share</small></div>
                    <div className="stock-fact"><span>YOUR POSITION</span><strong>{position?.shares ?? 0} shares</strong><small>{position ? money(position.marketValueCents) : 'No holdings'}</small></div>
                    <div className="stock-fact"><span>LAST TRADE TIME</span><strong>{selected ? new Date(selected.fetchedAt * 1000).toLocaleString() : '—'}</strong><small>{selected?.stale ? 'Quote too old for orders' : 'Provider timestamp'}</small></div>
                  </div></section>
                </div>
                <TradeTicket selected={selected} side={side} setSide={setSide} shares={shares} setShares={setShares} total={total} positionShares={position?.shares ?? 0} canTrade={canTrade} pending={pending} execute={execute} portfolio={portfolio}/>
              </div> : <section className="panel details-panel">
                <div className="panel-heading details-heading"><div><h2>{tab === 'portfolio' ? 'Open positions' : tab === 'leaderboard' ? 'Global rankings' : 'Executed orders'}</h2><p>{tab === 'portfolio' ? 'Market value and cost basis for your investments.' : tab === 'leaderboard' ? 'Ranked by total portfolio equity, including virtual cash.' : 'Your latest completed market orders.'}</p></div><span className="count-pill">{tab === 'portfolio' ? `${portfolio?.positions.length ?? 0} POSITIONS` : tab === 'leaderboard' ? 'TOP 25' : `${trades.length} TRADES`}</span></div>
                {tab === 'portfolio' ? <div className="responsive-table"><table><thead><tr><th>Asset</th><th>Shares</th><th>Average cost</th><th>Market value</th><th>Profit / loss</th><th></th></tr></thead><tbody>{portfolio?.positions.map(p => <tr key={p.symbol}><td data-label="Asset"><strong>{p.symbol}</strong><small>{p.quote.name}</small></td><td data-label="Shares">{p.shares}</td><td data-label="Average cost">{money(Math.round(p.costBasisCents / p.shares))}</td><td data-label="Market value">{money(p.marketValueCents)}</td><td data-label="Profit / loss" className={p.profitCents >= 0 ? 'positive' : 'negative'}>{signedMoney(p.profitCents)}</td><td data-label="Action"><button type="button" className="small-action" onClick={() => openStock(p.symbol, 'SELL')}>Trade <ArrowUpRight size={14}/></button></td></tr>)}</tbody></table>{!portfolio?.positions.length && <div className="empty">No holdings yet. Visit Trade to place your first order.</div>}</div> : tab === 'leaderboard' ? <div className="full-leaderboard">{leaders.map((leader, i) => <div key={leader.userId} className={`full-leader-row ${leader.userId === account.id ? 'self' : ''}`}><span className="rank">#{i + 1}</span><ProfileAvatar className="leader-avatar" url={leader.avatarUrl} name={leader.displayName}/><span className="full-leader-name"><strong>{leader.displayName}</strong>{leader.userId === account.id && <small>YOU</small>}</span><span className="full-leader-value"><strong>{money(leader.equityCents)}</strong><small className={leader.changeCents >= 0 ? 'positive' : 'negative'}>{signedMoney(leader.changeCents)} all time</small></span></div>)}{!leaders.length && <div className="empty">Rankings will appear when players join.</div>}</div> : <div className="responsive-table"><table><thead><tr><th>Order</th><th>Symbol</th><th>Shares</th><th>Fill price</th><th>Total</th><th>Time</th></tr></thead><tbody>{trades.map(trade => <tr key={trade.id}><td data-label="Order"><span className={`order-side ${trade.side === 'BUY' ? 'buy' : 'sell'}`}>{trade.side === 'BUY' ? <ArrowDownLeft size={14}/> : <ArrowUpRight size={14}/>} {trade.side}</span></td><td data-label="Symbol"><strong>{trade.symbol}</strong></td><td data-label="Shares">{trade.shares}</td><td data-label="Fill price">{money(trade.priceCents)}</td><td data-label="Total">{money(trade.shares * trade.priceCents)}</td><td data-label="Time">{new Date(trade.executedAt * 1000).toLocaleString()}</td></tr>)}</tbody></table>{!trades.length && <div className="empty">No trades yet. Your order history will appear here.</div>}</div>}
              </section>}
              <footer className="app-footer"><span>PaperStreet is a paper trading game. No real securities or money are exchanged.</span><span>Real provider quotes may be delayed. Virtual orders are available 24/7 using the last verified quote; prices can remain unchanged after exchange hours.</span></footer>
            </>}
          </div>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {links.map(({ id, label, icon: Icon }) => {
          const active = tab === id || (tab === 'stock' && id === 'trade');
          return <button key={id} type="button" className={active ? 'active' : ''}
            aria-current={active ? 'page' : undefined} onClick={() => goToPage(id)}>
            <Icon size={20} aria-hidden="true"/><span>{label}</span>
          </button>;
        })}
      </nav>
    </div>
  );
}

function Stat({ title, value, sub, icon, valueClass = '', subClass = '' }: { title: string; value: string; sub: string; icon: ReactNode; valueClass?: string; subClass?: string }) {
  return <div className="stat-card"><div className="stat-top"><span>{title}</span><span className="stat-icon">{icon}</span></div><strong className={valueClass}>{value}</strong><small className={subClass}>{sub}</small></div>;
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
    <p className="ticket-disclaimer">{selected?.stale ? 'No sufficiently recent verified quote. Orders resume once valid data is available.' : selected && !selected.marketOpen ? 'Trading is open 24/7 at the last verified Finnhub price. After hours, prices may not update.' : 'Orders execute at server validated Finnhub prices, possibly delayed. Virtual trades only.'}</p>
  </div></section>;
}

function ProfileAvatar({ url, name, className }: { url?: string | null; name: string; className: 'user-avatar' | 'leader-avatar' }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return <span className={className} aria-label={name} role="img">
    {url && failedUrl !== url
      ? <img src={url} alt={name} referrerPolicy="no-referrer" loading="lazy" onError={() => setFailedUrl(url)}/>
      : name.slice(0, 1).toUpperCase() || '?'}
  </span>;
}

createRoot(document.getElementById('root')!).render(<App/>);
