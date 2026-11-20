import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { DiscordSDK } from '@discord/embedded-app-sdk';
import { ArrowDownLeft, ArrowUpRight, BarChart3, CheckCircle2, ChevronRight, Clock3, Landmark, LayoutDashboard, ListOrdered, LoaderCircle, RefreshCw, ShieldCheck, TrendingDown, TrendingUp, Wallet, X } from 'lucide-react';
import type { Leader, Portfolio, Quote, SymbolCode, Trade } from '../shared/stocks';
import { STARTING_CASH_CENTS } from '../shared/stocks';
import './style.css';

type Tab = 'market' | 'portfolio' | 'leaderboard' | 'history';
type Config = { clientId: string | null; marketMode: 'simulated' | 'finnhub'; startingCashCents: number };
type Account = { id: string; displayName: string };
const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const signedMoney = (cents: number) => `${cents > 0 ? '+' : ''}${money(cents)}`;
const pct = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
const getError = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong';
const short = (name: string) => name.length > 18 ? `${name.slice(0, 18)}…` : name;

async function request<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers ?? {}) } });
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
    if (first?.status === 'rejected') setFeedback({ kind: 'error', message: getError(first.reason) });
  }, []);

  useEffect(() => {
    let active = true;
    async function connect() {
      try {
        const settings = await request<Config>('/api/config');
        if (!active) return;
        setConfig(settings);
        if (!settings.clientId || !/^\d{15,22}$/.test(settings.clientId)) throw new Error('Set DISCORD_CLIENT_ID in your Cloudflare Worker secrets.');
        if (window.self === window.top) throw new Error('Launch PaperStreet through the Discord App Launcher to sign in.');
        const sdk = new DiscordSDK(settings.clientId);
        await sdk.ready();
        if (!active) return;
        setAuthStatus('Authorizing your Discord account…');
        const { code } = await sdk.commands.authorize({ client_id: settings.clientId, response_type: 'code', state: '', prompt: 'none', scope: ['identify', 'applications.commands'] });
        const auth = await request<{ access_token: string; session: string; user: Account }>('/api/auth', undefined, { method: 'POST', body: JSON.stringify({ code }) });
        await sdk.commands.authenticate({ access_token: auth.access_token });
        if (!active) return;
        setToken(auth.session);
        setAccount(auth.user);
        setAuthStatus('Connected');
        setLoading(true);
        await refresh(auth.session);
        if (active) setLoading(false);
      } catch (error) {
        if (active) { setAuthError(getError(error)); setAuthStatus('Not connected'); setLoading(false); }
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

  const selected = quotes.find(q => q.symbol === selectedSymbol);
  const quantity = Number(shares);
  const validQuantity = Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 100_000;
  const total = selected && validQuantity ? selected.priceCents * quantity : 0;
  const position = portfolio?.positions.find(h => h.symbol === selectedSymbol);
  const canTrade = selected && !selected.stale && validQuantity && !!portfolio && (side === 'BUY' ? portfolio.cashCents >= total : (position?.shares ?? 0) >= quantity);
  const shown = useMemo(() => quotes.filter(q => `${q.symbol} ${q.name}`.toLowerCase().includes(search.toLowerCase())), [quotes, search]);
  const gainers = quotes.filter(q => q.changePct > 0).length;

  async function execute() {
    if (!canTrade || !selected || !token) return;
    setPending(true);
    setFeedback(null);
    try {
      const response = await request<{ fillPriceCents?: number; duplicate?: boolean }>('/api/trade', token, { method: 'POST', body: JSON.stringify({ symbol: selected.symbol, side, shares: quantity, expectedPriceCents: selected.priceCents, orderId: crypto.randomUUID() }) });
      setFeedback({ kind: 'ok', message: response.duplicate ? 'Order already filled.' : `${side === 'BUY' ? 'Bought' : 'Sold'} ${quantity} ${selected.symbol} at ${money(response.fillPriceCents ?? selected.priceCents)}.` });
      await refresh(token);
    } catch (error) { setFeedback({ kind: 'error', message: getError(error) }); }
    finally { setPending(false); }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-icon"><Landmark size={22}/></div><div><strong>PaperStreet</strong><span>THE TRADING FLOOR</span></div></div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {([['market', LayoutDashboard, 'Market'], ['portfolio', Wallet, 'My portfolio'], ['leaderboard', ListOrdered, 'Leaderboard'], ['history', Clock3, 'Trade history']] as const).map(([id, Icon, name]) => (
            <button key={id} className={`nav-button ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}><Icon size={18}/><span>{name}</span>{tab === id && <ChevronRight className="nav-chevron" size={16}/>}</button>
          ))}
        </nav>
        <div className="sidebar-bottom"><div className="sidebar-note"><ShieldCheck size={18}/><div><strong>No real money.</strong><span>Trade virtual shares, take real lessons.</span></div></div><div className="version">PAPERSTREET / V0.1</div></div>
      </aside>
      <main className="main-content">
        <header className="topbar"><div className="breadcrumb"><span>Workspace</span><ChevronRight size={13}/><strong>{tab === 'market' ? 'Market overview' : tab === 'portfolio' ? 'My portfolio' : tab === 'leaderboard' ? 'Leaderboard' : 'Trade history'}</strong></div><div className="top-actions"><span className={`market-mode ${config?.marketMode === 'finnhub' ? 'real' : ''}`}><span className="status-dot"/>{config?.marketMode === 'finnhub' ? 'FINNHUB QUOTES' : 'SIMULATED MARKET'}</span><button className="icon-button" aria-label="Refresh data" disabled={!token || loading} onClick={() => { setFeedback(null); setLoading(true); void refresh(token).finally(() => setLoading(false)); }}><RefreshCw size={17} className={loading ? 'spin' : ''}/></button><div className="user-avatar" title={account?.displayName ?? 'Discord user'}>{account?.displayName?.slice(0, 1).toUpperCase() ?? '?'}</div></div></header>
        <div className="content-wrap">
          <div className="headline"><div><div className="eyebrow">PAPERSTREET EXCHANGE <span className="dot-separator">•</span> VIRTUAL MONEY</div><h1>{tab === 'market' ? 'Market overview' : tab === 'portfolio' ? 'Your portfolio' : tab === 'leaderboard' ? 'Top traders' : 'Trade history'}</h1><p>{tab === 'market' ? 'Research, buy and sell stocks. Build your edge.' : tab === 'portfolio' ? 'Every position. Every gain. Every decision.' : tab === 'leaderboard' ? 'A global ranking by live portfolio equity.' : 'A clear record of every executed order.'}</p></div><span className="date-badge"><span className="status-dot"/> {authStatus}</span></div>
          {!account ? <div className="welcome-panel"><div className="welcome-icon"><BarChart3 size={29}/></div><h2>Your portfolio starts at {money(STARTING_CASH_CENTS)}</h2><p>Join the PaperStreet Activity inside Discord to create your trader profile and start building a portfolio with virtual cash.</p><div className="auth-status">{authError || authStatus}</div><small>Use Discord’s App Launcher to open PaperStreet. No separate account required.</small></div> : <>
            {feedback && <div role="status" className={`feedback ${feedback.kind}`}><span>{feedback.kind === 'ok' ? <CheckCircle2 size={18}/> : <X size={18}/>} {feedback.message}</span><button aria-label="Dismiss notice" onClick={() => setFeedback(null)}><X size={17}/></button></div>}
            <div className="stats-grid">
              <Stat title="TOTAL EQUITY" value={money(portfolio?.equityCents ?? STARTING_CASH_CENTS)} sub="Portfolio market value" icon={<Landmark size={18}/>} />
              <Stat title="BUYING POWER" value={money(portfolio?.cashCents ?? STARTING_CASH_CENTS)} sub="Available virtual cash" icon={<Wallet size={18}/>} />
              <Stat title="ALL TIME RETURN" value={signedMoney(portfolio?.profitCents ?? 0)} sub={pct(((portfolio?.profitCents ?? 0) / STARTING_CASH_CENTS) * 100)} icon={<TrendingUp size={18}/>} valueClass={(portfolio?.profitCents ?? 0) >= 0 ? 'positive' : 'negative'} />
              <Stat title="OPEN POSITIONS" value={String(portfolio?.positions.length ?? 0).padStart(2, '0')} sub={`${gainers} of ${quotes.length} stocks advancing`} icon={<BarChart3 size={18}/>} />
            </div>
            {tab === 'market' ? <div className="trade-layout"><section className="panel market-panel"><div className="panel-heading"><div><h2>Discover stocks</h2><p>{config?.marketMode === 'finnhub' ? 'Last available provider quotes, possibly delayed' : 'Fictional prices generated by the PaperStreet simulator'}</p></div><span className="count-pill">{quotes.length} ASSETS</span></div><div className="table-tools"><input value={search} onChange={e => setSearch(e.target.value)} aria-label="Search stocks" placeholder="Search symbols or companies…"/><span>USD / SHARE</span></div><div className="stock-list"><div className="stock-head"><span>ASSET</span><span>PRICE</span><span>VS. PREV. CLOSE</span><span/></div>{shown.map(q => <button key={q.symbol} className={`stock-row ${q.symbol === selectedSymbol ? 'selected' : ''}`} onClick={() => setSelectedSymbol(q.symbol)}><span className="stock-name"><span className="ticker-icon">{q.symbol.slice(0, 2)}</span><span><strong>{q.symbol}</strong><small>{q.name}</small></span></span><strong className="stock-price">{money(q.priceCents)}</strong><span className={`change ${q.changePct >= 0 ? 'positive' : 'negative'}`}>{q.changePct >= 0 ? <TrendingUp size={15}/> : <TrendingDown size={15}/>} {pct(q.changePct)}</span><ChevronRight size={17} className="row-chevron"/></button>)}{!shown.length && <div className="empty">No stocks match your search.</div>}</div></section><TradeTicket selected={selected} side={side} setSide={setSide} shares={shares} setShares={setShares} total={total} positionShares={position?.shares ?? 0} canTrade={!!canTrade} pending={pending} execute={execute}/></div> : tab === 'portfolio' ? <section className="panel wide-panel"><div className="panel-heading"><div><h2>Your holdings</h2><p>Unrealized gains and losses are marked to the latest displayed quote.</p></div></div><div className="responsive-table"><table><thead><tr><th>Asset</th><th>Shares</th><th>Avg. cost</th><th>Market value</th><th>Total return</th><th/></tr></thead><tbody>{portfolio?.positions.map(p => <tr key={p.symbol}><td><strong>{p.symbol}</strong><small>{p.quote.name}</small></td><td>{p.shares}</td><td>{money(Math.round(p.costBasisCents / p.shares))}</td><td>{money(p.marketValueCents)}</td><td className={p.profitCents >= 0 ? 'positive' : 'negative'}>{signedMoney(p.profitCents)}</td><td><button className="small-action" onClick={() => { setSelectedSymbol(p.symbol); setTab('market'); setSide('SELL'); }}>Trade <ArrowUpRight size={14}/></button></td></tr>)}</tbody></table>{!portfolio?.positions.length && <div className="empty">No holdings yet. Visit the market to make your first trade.</div>}</div></section> : tab === 'leaderboard' ? <section className="panel wide-panel"><div className="panel-heading"><div><h2>Global leaderboard</h2><p>Ranked by virtual cash plus the current value of holdings.</p></div><span className="count-pill">TOP 25</span></div><div className="leaderboard-list">{leaders.map((p, i) => <div className={`leader-row ${p.userId === account.id ? 'self' : ''}`} key={p.userId}><span className={`rank ${i < 3 ? 'top-rank' : ''}`}>#{i + 1}</span><span className="leader-avatar">{p.displayName.slice(0, 1).toUpperCase()}</span><span className="leader-name"><strong>{short(p.displayName)}</strong>{p.userId === account.id && <small>YOU</small>}</span><span className="leader-value"><strong>{money(p.equityCents)}</strong><small className={p.changeCents >= 0 ? 'positive' : 'negative'}>{signedMoney(p.changeCents)} all time</small></span></div>)}{!leaders.length && <div className="empty">No ranking available yet.</div>}</div></section> : <section className="panel wide-panel"><div className="panel-heading"><div><h2>Order history</h2><p>Your 30 most recent executed trades.</p></div></div><div className="responsive-table"><table><thead><tr><th>Side</th><th>Symbol</th><th>Shares</th><th>Fill price</th><th>Notional</th><th>Date</th></tr></thead><tbody>{trades.map(t => <tr key={t.id}><td><span className={`order-side ${t.side === 'BUY' ? 'buy' : 'sell'}`}>{t.side === 'BUY' ? <ArrowDownLeft size={13}/> : <ArrowUpRight size={13}/>} {t.side}</span></td><td><strong>{t.symbol}</strong></td><td>{t.shares}</td><td>{money(t.priceCents)}</td><td>{money(t.priceCents * t.shares)}</td><td>{new Date(t.executedAt * 1000).toLocaleString()}</td></tr>)}</tbody></table>{!trades.length && <div className="empty">Your completed orders will appear here.</div>}</div></section>}
            <footer className="app-footer">PAPERSTREET IS A GAME. NOT FINANCIAL ADVICE. NO REAL SECURITIES OR MONEY ARE EXCHANGED. <span>{config?.marketMode === 'simulated' ? 'PRICES ARE ENTIRELY SIMULATED.' : 'QUOTES MAY BE DELAYED.'}</span></footer>
          </>}
        </div>
      </main>
    </div>
  );
}

function Stat({ title, value, sub, icon, valueClass = '' }: { title: string; value: string; sub: string; icon: ReactNode; valueClass?: string }) {
  return <div className="stat-card"><div className="stat-top"><span>{title}</span><span className="stat-icon">{icon}</span></div><strong className={valueClass}>{value}</strong><small>{sub}</small></div>;
}
function TradeTicket({ selected, side, setSide, shares, setShares, total, positionShares, canTrade, pending, execute }: {
  selected?: Quote; side: 'BUY' | 'SELL'; setSide: (v: 'BUY' | 'SELL') => void; shares: string; setShares: (v: string) => void;
  total: number; positionShares: number; canTrade: boolean; pending: boolean; execute: () => void;
}) {
  return <section className="panel trade-panel"><div className="panel-heading"><div><h2>Trade ticket</h2><p>Market orders, whole shares</p></div><span className="ticket-indicator"><span className="status-dot"/> ACTIVE</span></div><div className="ticket-body"><div className="ticket-asset"><div className="ticker-icon large">{selected?.symbol.slice(0, 2) ?? '??'}</div><div><strong>{selected?.symbol ?? 'Select an asset'}</strong><small>{selected?.name ?? 'Choose from market'}</small></div><span className="ticket-quote">{selected ? money(selected.priceCents) : '—'}<small className={selected && selected.changePct < 0 ? 'negative' : 'positive'}>{selected ? pct(selected.changePct) : '—'}</small></span></div><div className="side-selector"><button className={side === 'BUY' ? 'current buy' : ''} onClick={() => setSide('BUY')}>Buy</button><button className={side === 'SELL' ? 'current sell' : ''} onClick={() => setSide('SELL')}>Sell</button></div><label className="field-label" htmlFor="shares">QUANTITY <span>SHARES</span></label><div className="quantity-wrapper"><input id="shares" type="number" inputMode="numeric" min="1" max="100000" step="1" value={shares} onChange={e => setShares(e.target.value)}/><span>SHARES</span></div><div className="ticket-breakdown"><div><span>Price per share</span><strong>{selected ? money(selected.priceCents) : '—'}</strong></div><div><span>Shares owned</span><strong>{positionShares}</strong></div><div className="ticket-total"><span>Estimated total</span><strong>{money(total)}</strong></div></div><button className={`execute-button ${side.toLowerCase()}`} disabled={!canTrade || pending} onClick={execute}>{pending ? <LoaderCircle className="spin" size={17}/> : side === 'BUY' ? <ArrowDownLeft size={18}/> : <ArrowUpRight size={18}/>} {pending ? 'Executing…' : `${side === 'BUY' ? 'Buy' : 'Sell'} ${selected?.symbol ?? 'stock'}`}</button><p className="ticket-disclaimer">Orders execute at the server validated quote. Prices may change before your order fills.</p></div></section>;
}

createRoot(document.getElementById('root')!).render(<App/>);
