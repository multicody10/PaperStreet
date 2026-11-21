import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DiscordSDK } from '@discord/embedded-app-sdk';
import {
  ArrowDownLeft, ArrowLeft, ArrowLeftRight, ArrowUpRight, BarChart3, CheckCircle2,
  ChevronRight, Clock3, LayoutDashboard,
  LoaderCircle, RefreshCw, Search, TrendingDown,
  TrendingUp, Trophy, Wallet, Award, X,
} from 'lucide-react';
import type { ChartHistory, HistoryRange, Leader, Portfolio, Quote, SymbolCode, Trade } from '../shared/stocks';
import { HISTORY_RANGES, STARTING_CASH_CENTS, STOCKS } from '../shared/stocks';
import { appHash, parseAppHash, type Page, type View } from './navigation';
import { DayRange, money, PriceChart } from './PriceChart';
import { Challenges, OrderList } from './Challenges';
import { StockPredictions } from './StockPredictions';
import { TradingDashboard } from './TradingDashboard';
import { FitPager, SectionTabs } from './FitPager';
import type { Achievement, OrderKind, Prediction, PredictionDirection, QueuedOrder } from '../shared/gameplay';
import './style.css';
import './mobile.css';
import './gameplay.css';
import './desktop.css';
import './layout.css';
import './fit.css';
import './desktop-cards.css';
import './stock-predictions.css';
import './terminal.css';

type Config = { clientId: string | null; provider: 'finnhub'; dataConfigured: boolean; startingCashCents: number };
type Account = { id: string; displayName: string; avatarUrl: string };
const signedMoney = (cents: number) => `${cents > 0 ? '+' : ''}${money(cents)}`;
const pct = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong';
const short = (value: string, max = 22) => value.length > max ? `${value.slice(0, max)}…` : value;
const links: { id: Page; label: string; icon: typeof LayoutDashboard; mobileLabel?: string }[] = [
  { id: 'dashboard', label: 'Dashboard', mobileLabel: 'Home', icon: LayoutDashboard },
  { id: 'trade', label: 'Trade', icon: ArrowLeftRight },
  { id: 'portfolio', label: 'Portfolio', icon: Wallet },
  { id: 'leaderboard', label: 'Leaderboard', mobileLabel: 'Ranks', icon: Trophy },
  { id: 'history', label: 'History', icon: Clock3 },
  { id: 'challenges', label: 'Goals', mobileLabel: 'Goals', icon: Award },
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
  const [tab, setTab] = useState<View>(() => parseAppHash(window.location.hash).view);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<SymbolCode>(() => parseAppHash(window.location.hash).symbol);
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [shares, setShares] = useState('1');
  const [orderKind, setOrderKind] = useState<'AUTO' | 'IMMEDIATE' | OrderKind>('AUTO');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [orders, setOrders] = useState<QueuedOrder[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [forecastPending, setForecastPending] = useState(false);
  const [cancelingOrder, setCancelingOrder] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);
  const [search, setSearch] = useState('');
  const [quickSearch,setQuickSearch] = useState('');
  const [history, setHistory] = useState<{ key: string; data?: ChartHistory; error?: string }>();
  const [historyRange, setHistoryRange] = useState<HistoryRange>('1W');
  const [tradePane, setTradePane] = useState<'stocks'|'movers'>('stocks');
  const [stockPane, setStockPane] = useState<'chart'|'order'|'facts'|'predict'>('chart');
  const [portfolioPane, setPortfolioPane] = useState<'positions'|'orders'>('positions');
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
    setOrderKind('AUTO');
    setTriggerPrice('');
    setStockPane('chart');
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


  const refresh = useCallback(async (session: string, view: View) => {
    if (!session) return;
    // Only load data consumed by the current page, saving Worker requests and D1 reads.
    const jobs: Promise<void>[] = [];
    if (view === 'dashboard' || view === 'trade' || view === 'stock' || view === 'challenges')
      jobs.push(request<{ quotes: Quote[] }>('/api/market', session).then(({ quotes }) => setQuotes(quotes)));
    if (view === 'dashboard' || view === 'portfolio' || view === 'stock')
      jobs.push(request<{ portfolio: Portfolio }>('/api/portfolio', session).then(({ portfolio }) => setPortfolio(portfolio)));
    if (view === 'dashboard' || view === 'leaderboard')
      jobs.push(request<{ leaders: Leader[] }>('/api/leaderboard', session).then(({ leaders }) => setLeaders(leaders)));
    if (view === 'dashboard' || view === 'history')
      jobs.push(request<{ trades: Trade[] }>('/api/history', session).then(({ trades }) => setTrades(trades)));
    if (view === 'dashboard' || view === 'stock' || view === 'portfolio')
      jobs.push(request<{ orders: QueuedOrder[] }>('/api/orders', session).then(({ orders }) => setOrders(orders)));
    if (view === 'stock')
      jobs.push(request<{ predictions: Prediction[] }>('/api/predictions', session).then(({ predictions }) => setPredictions(predictions)));
    if (view === 'dashboard' || view === 'challenges')
      jobs.push(request<{ achievements: Achievement[] }>('/api/achievements', session).then(({ achievements }) => setAchievements(achievements)));
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
    if (!token || (tab !== 'stock' && tab !== 'dashboard')) return;
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
  const effectiveOrderKind: 'IMMEDIATE' | OrderKind = selected?.marketOpen
    ? orderKind === 'AUTO' ? 'IMMEDIATE' : orderKind
    : orderKind === 'LIMIT' || orderKind === 'STOP' ? orderKind : 'MARKET';
  const triggerCents = triggerPrice.trim() ? Math.round(Number(triggerPrice)*100) : 0;
  const validTrigger = Number.isSafeInteger(triggerCents) && triggerCents > 0 && triggerCents <= 100_000_000;
  const canSubmitOrder = effectiveOrderKind === 'IMMEDIATE' ? canTrade :
    !!selected && validQuantity && (effectiveOrderKind === 'MARKET' || validTrigger);
  const shown = useMemo(
    () => quotes.filter(q => `${q.symbol} ${q.name}`.toLowerCase().includes(search.toLowerCase().trim())),
    [quotes, search],
  );
  const gainers = quotes.filter(q => q.changePct > 0).length;
  const refreshNow = () => {
    if (!token || loading) return;
    setFeedback(null);
    setLoading(true);
    void refresh(token, tab).finally(() => setLoading(false));
  };

  async function execute() {
    if ((tab !== 'stock' && tab !== 'dashboard') || !canSubmitOrder || !selected || !token || pending) return;
    setPending(true);
    setFeedback(null);
    try {
      if (effectiveOrderKind !== 'IMMEDIATE') {
        await request('/api/orders', token, { method: 'POST', body: JSON.stringify({
          symbol: selected.symbol, side, shares: quantity, kind: effectiveOrderKind,
          triggerPriceCents: effectiveOrderKind === 'MARKET' ? null : triggerCents,
          orderId: crypto.randomUUID(),
        }) });
        setFeedback({ kind: 'ok', message: 'Order queued for ' + selected.symbol + '. View or cancel it in Portfolio.' });
      } else {
        const response = await request<{ fillPriceCents?: number; duplicate?: boolean }>('/api/trade', token, {
          method: 'POST',
          body: JSON.stringify({symbol:selected.symbol,side,shares:quantity,expectedPriceCents:selected.priceCents,orderId:crypto.randomUUID()}),
        });
        setFeedback({
          kind:'ok', message:response.duplicate ? 'Order already filled.' :
            (side === 'BUY' ? 'Bought ' : 'Sold ') + quantity + ' ' + selected.symbol + ' at ' + money(response.fillPriceCents ?? selected.priceCents) + '.',
        });
      }
      await refresh(token, tab);
    } catch (error) { setFeedback({ kind:'error', message:errorMessage(error) }); }
    finally { setPending(false); }
  }

  async function submitForecast(symbol: SymbolCode, direction: PredictionDirection) {
    if (!token || tab !== 'stock' || symbol !== selectedSymbol || forecastPending) return;
    setForecastPending(true);
    setFeedback(null);
    try {
      await request('/api/predictions',token,{method:'POST',body:JSON.stringify({symbol,direction})});
      setFeedback({kind:'ok',message:'Prediction locked for the next trading session.'});
      await refresh(token,'stock');
    } catch(error) { setFeedback({kind:'error',message:errorMessage(error)}); }
    finally { setForecastPending(false); }
  }

  async function cancelQueuedOrder(id: number) {
    if (!token || cancelingOrder !== null) return;
    setCancelingOrder(id);
    setFeedback(null);
    try {
      await request('/api/orders/'+id+'/cancel',token,{method:'POST'});
      await refresh(token,'portfolio');
      setFeedback({kind:'ok',message:'Queued order canceled.'});
    } catch(error) { setFeedback({kind:'error',message:errorMessage(error)}); }
    finally { setCancelingOrder(null); }
  }

  const title = tab === 'dashboard' ? 'Dashboard' :
    tab === 'trade' ? 'Trade' :
    tab === 'portfolio' ? 'Portfolio' :
    tab === 'challenges' ? 'Goals' :
    tab === 'leaderboard' ? 'Leaderboard' :
    tab === 'history' ? 'History' : selected?.name ?? selectedSymbol;

  return (
    <div className="app-shell">
      <header className="global-header">
        <div className="brand" aria-label="PaperStreet">
          <span className="brand-mark"><TrendingUp size={26} strokeWidth={3}/></span>
          <span className="brand-words"><strong>Paper<span>Street</span></strong></span>
        </div>
        <div className="header-market" aria-label="Market status and selected real quotes">
          <div className={'header-market-status '+(quotes.length&&quotes.some(q=>q.marketOpen)?'open':'closed')}>
            <span className="status-dot"/>{!quotes.length?'Quotes pending':quotes.some(q=>q.marketOpen)?'Markets Open':'Markets Closed'}
          </div>
          {(['SPY','AAPL','NVDA'] as SymbolCode[]).map(symbol=>{
            const quote=quotes.find(q=>q.symbol===symbol);
            return quote?<div className="header-ticker" key={symbol}><strong>{symbol}</strong><span>{money(quote.priceCents)}</span>
              <b className={quote.changePct>=0?'positive':'negative'}>{pct(quote.changePct)}</b></div>:null;
          })}
        </div>
        <div className="header-actions">
          <div className="header-search">
            <Search size={17} aria-hidden="true"/>
            <input type="search" aria-label="Find a stock" placeholder="Search symbols, companies..." value={quickSearch}
              onChange={event=>setQuickSearch(event.target.value)}
              onKeyDown={event=>{
                if(event.key==='Enter'){
                  const match=STOCKS.find(q=>(q.symbol+' '+q.name).toLowerCase().includes(quickSearch.trim().toLowerCase()));
                  if(match&&quickSearch.trim()){openStock(match.symbol);setQuickSearch('');}
                }
                if(event.key==='Escape')setQuickSearch('');
              }}/>
            {quickSearch.trim()&&<div className="header-search-results" role="listbox" aria-label="Stock search results">
              {STOCKS.filter(q=>(q.symbol+' '+q.name).toLowerCase().includes(quickSearch.trim().toLowerCase())).slice(0,5).map(q=>
                <button type="button" key={q.symbol} onClick={()=>{openStock(q.symbol);setQuickSearch('')}}><strong>{q.symbol}</strong><span>{q.name}</span></button>)}
            </div>}
          </div>
          <button type="button" className="icon-button" aria-label="Refresh market and portfolio" title="Refresh" disabled={!token||loading} onClick={refreshNow}>
            <RefreshCw size={17} className={loading?'spin':''}/>
          </button>
          <div className="user-chip" title={account?.displayName??'Discord user'}>
            <ProfileAvatar className="user-avatar" url={account?.avatarUrl} name={account?.displayName??'Discord user'}/>
            <span className="user-copy"><strong>{short(account?.displayName??'Discord user',17)}</strong><small><span className="online-dot"/>{authStatus}</small></span>
          </div>
        </div>
      </header>
      <div className="shell-body">
        <aside className="sidebar">
          <nav aria-label="Main navigation">
            {links.map(({ id, label, mobileLabel, icon: Icon }) => {
              const active = tab === id || (tab === 'stock' && id === 'trade');
              return <button type="button" key={id} title={label} className={'nav-button ' + (active ? 'active' : '')}
                aria-current={active ? 'page' : undefined} onClick={() => goToPage(id)}>
                <Icon size={22} aria-hidden="true"/><span>{mobileLabel ?? label}</span>
              </button>;
            })}
          </nav>
        </aside>
        <main className="main-content">
          <div className="content-wrap">
            {tab !== 'stock' && tab !== 'dashboard' && <div className="headline"><h1>{title}</h1></div>}
            {!account ? <section className="welcome-panel"><div className="welcome-icon"><BarChart3 size={30}/></div><h2>Start with {money(STARTING_CASH_CENTS)}</h2><p>Connect through the Discord App Launcher to start trading stocks using virtual cash.</p><div className="auth-status" role="status">{authError || authStatus}</div><small>PaperStreet is a game. No real money is exchanged.</small></section> : <>
              {!config?.dataConfigured && <div className="feedback error" role="alert"><span><X size={17}/> Market data is not configured. The operator must add FINNHUB_API_KEY as a Cloudflare Worker secret.</span></div>}
              {feedback && <div className={`feedback ${feedback.kind}`} role="status"><span>{feedback.kind === 'ok' ? <CheckCircle2 size={17}/> : <X size={17}/>} {feedback.message}</span><button type="button" aria-label="Dismiss notice" onClick={() => setFeedback(null)}><X size={16}/></button></div>}

              {tab === 'trade' && <SectionTabs label="Trade panels" value={tradePane} onChange={setTradePane}
                items={[{id:'stocks',label:'Stocks'},{id:'movers',label:'Movers'}]}/>}
              {tab === 'stock' && <div className="stock-page-controls">
                <button type="button" className="stock-back" onClick={() => goToPage('trade')}><ArrowLeft size={16}/> All stocks</button>
                <SectionTabs label="Stock panels" value={stockPane} onChange={setStockPane}
                  items={[{id:'chart',label:'Chart'},{id:'order',label:'Order'},{id:'facts',label:'Details'},{id:'predict',label:'Predict'}]}/>
              </div>}
              {tab === 'portfolio' && <SectionTabs label="Portfolio panels" value={portfolioPane} onChange={setPortfolioPane}
                items={[{id:'positions',label:'Positions'},{id:'orders',label:'Queued orders'}]}/>}
              {tab === 'dashboard' ? <TradingDashboard
                portfolio={portfolio} quotes={quotes} trades={trades} achievements={achievements}
                selectedSymbol={selectedSymbol} setSelectedSymbol={setSelectedSymbol}
                onOpenStock={symbol=>openStock(symbol)} onNavigate={goToPage}
                selected={selected} history={currentHistory?.data} historyError={currentHistory?.error}
                range={historyRange} setRange={setHistoryRange}
                side={side} setSide={setSide} shares={shares} setShares={setShares}
                orderKind={effectiveOrderKind} setOrderKind={setOrderKind} triggerPrice={triggerPrice} setTriggerPrice={setTriggerPrice}
                total={total} canSubmit={canSubmitOrder} pending={pending} execute={()=>void execute()}
              /> : tab === 'trade' ? <div className="trade-overview" data-pane={tradePane} aria-label="Market overview and stock selection">
                <section className="panel market-panel trade-universe">
                  <div className="panel-heading"><h2><BarChart3 size={18}/> Stocks</h2><label className="search-field"><Search size={15}/><input aria-label="Search market symbols" placeholder="Search stocks" value={search} onChange={event => setSearch(event.target.value)}/></label></div>
                  <div className="stock-head"><span>COMPANY</span><span>LAST PRICE</span><span>DAY RANGE</span><span>CHANGE</span></div>
                  <FitPager items={shown} rowHeight={70} compactRowHeight={74} empty={quotes.length?'No matching stocks.':'Market quotes unavailable.'}
                    render={items=><div className="stock-list">{items.map(quote=><button type="button" key={quote.symbol} className="stock-row" onClick={()=>openStock(quote.symbol)}>
                      <span className="stock-name"><span className="ticker-icon">{quote.symbol.slice(0,2)}</span><span><strong>{quote.symbol}</strong><small>{quote.name}{quote.stale?' · Stale':''}</small></span></span>
                      <strong className="stock-price">{money(quote.priceCents)}</strong>
                      <span className="day-range-cell"><DayRange quote={quote}/></span>
                      <span className={quote.changePct>=0?'change positive':'change negative'}>{pct(quote.changePct)}</span>
                    </button>)}</div>}/>
                </section>
                <div className="trade-insights">
                  <section className="panel trade-breadth">
                    <div className="panel-heading"><h2><TrendingUp size={18}/> Market overview</h2><span className="count-pill">{quotes.length} SYMBOLS</span></div>
                    <div className="pulse-summary"><div className="pulse-stat"><span>Advancing</span><strong className="positive">{gainers}</strong></div><div className="pulse-stat"><span>Declining</span><strong className="negative">{quotes.filter(q => q.changePct < 0).length}</strong></div></div>
                  </section>
                  <section className="panel trade-movers">
                    <div className="panel-heading"><h2><BarChart3 size={18}/> Biggest movers</h2></div>
                    <FitPager items={[...quotes].sort((a,b)=>Math.abs(b.changePct)-Math.abs(a.changePct))} rowHeight={72} compactRowHeight={76} empty="No market data."
                      render={items=><div className="panel-scroll">{items.map(quote=><button type="button" className="market-mover" key={quote.symbol} onClick={()=>openStock(quote.symbol)}>
                        <span><strong>{quote.symbol}</strong><small>{quote.name}</small></span>
                        <span className={quote.changePct>=0?'change positive':'change negative'}>{pct(quote.changePct)}</span>
                      </button>)}</div>}/>
                  </section>
                </div>
              </div> : tab === 'stock' ? <div className="stock-workspace" data-pane={stockPane} aria-label={'Stock details and trading for ' + selectedSymbol}>
                <div className="stock-research">
                  
                  <section className="panel chart-panel" aria-label={selectedSymbol + ' price history'}>
                    <div className="chart-top"><div className="symbol-badge">{selectedSymbol.slice(0, 2)}</div><div className="chart-identity"><h1>{selectedSymbol}</h1><span>{selected?.name ?? 'Loading…'}</span></div><span className="chart-source" title={selected ? 'Provider last trade: ' + new Date(selected.fetchedAt * 1000).toLocaleString() : undefined}>FINNHUB · LAST TRADE</span></div>
                    <div className="chart-price"><strong>{selected ? money(selected.priceCents) : '—'}</strong><span className={selected && selected.changePct < 0 ? 'negative' : 'positive'}>{selected ? <>{selected.changePct >= 0 ? <TrendingUp size={15}/> : <TrendingDown size={15}/>} {pct(selected.changePct)}</> : 'Waiting for prices'}</span></div>
                    <div className="chart-range-bar" role="group" aria-label="Select stock history time range">
                      {HISTORY_RANGES.map(range => <button key={range} type="button" className={historyRange === range ? 'active' : ''} aria-pressed={historyRange === range} onClick={() => setHistoryRange(range)}>{range}</button>)}
                    </div>
                    <PriceChart key={historyKey} history={currentHistory?.data} quote={selected} range={historyRange} error={currentHistory?.error}/>
                  </section>
                  <section className="panel stock-quote-facts" aria-label="Stock quote details"><div className="stock-facts">
                    <div className="stock-fact"><span>SESSION RANGE</span>{selected?.sessionBar ? <DayRange quote={selected}/> : <strong>—</strong>}</div>
                    <div className="stock-fact"><span>PREVIOUS CLOSE</span><strong>{selected ? money(selected.previousCloseCents) : '—'}</strong></div>
                    <div className="stock-fact"><span>YOUR POSITION</span><strong>{position?.shares ?? 0} shares</strong><small>{position ? money(position.marketValueCents) : 'No holdings'}</small></div>
                    <div className="stock-fact"><span>LAST TRADE TIME</span><strong>{selected ? new Date(selected.fetchedAt * 1000).toLocaleString() : '—'}</strong>{selected?.stale && <small>Quote outdated</small>}</div>
                  </div></section>
                </div>
                <TradeTicket selected={selected} side={side} setSide={setSide} shares={shares} setShares={setShares} total={total} positionShares={position?.shares ?? 0} canTrade={canSubmitOrder} pending={pending} execute={execute} portfolio={portfolio} orderKind={effectiveOrderKind} setOrderKind={setOrderKind} triggerPrice={triggerPrice} setTriggerPrice={setTriggerPrice} viewOrders={() => goToPage('portfolio')}/>
                <DesktopTradeTicket selected={selected} side={side} setSide={setSide} shares={shares} setShares={setShares} total={total} positionShares={position?.shares ?? 0} canTrade={canSubmitOrder} pending={pending} execute={execute} portfolio={portfolio} orderKind={effectiveOrderKind} setOrderKind={setOrderKind} triggerPrice={triggerPrice} setTriggerPrice={setTriggerPrice} viewOrders={() => goToPage('portfolio')}/>
                <StockPredictions key={selectedSymbol} symbol={selectedSymbol} quote={selected} predictions={predictions}
                  pending={forecastPending} submit={(symbol,direction)=>void submitForecast(symbol,direction)}/>
              </div> : tab === 'challenges' ? <Challenges quotes={quotes} achievements={achievements} openStock={openStock}/> : <div className={tab === 'portfolio' ? 'details-stack portfolio-stack' : 'details-stack'} data-pane={tab === 'portfolio' ? portfolioPane : 'positions'}>
                {tab === 'portfolio' && <OrderList orders={orders} onCancel={id => void cancelQueuedOrder(id)} canceling={cancelingOrder}/>}
                <section className="panel details-panel">
                  <div className="panel-heading details-heading">
                    <h2>{tab==='portfolio'?'Positions':tab==='leaderboard'?'Top traders':'Executed trades'}</h2>
                    <span className="count-pill">{tab==='portfolio'?(portfolio?.positions.length??0)+' POSITIONS':
                      tab==='leaderboard'?leaders.length+' TRADERS':trades.length+' TRADES'}</span>
                  </div>
                  {tab==='portfolio' ? <FitPager items={portfolio?.positions??[]} rowHeight={65} compactRowHeight={158} compactBreakpoint={930} overhead={45} empty="No positions."
                    render={items=><div className="responsive-table"><table>
                      <thead><tr><th>Asset</th><th>Shares</th><th>Average cost</th><th>Market value</th><th>Profit / loss</th><th></th></tr></thead>
                      <tbody>{items.map(p=><tr key={p.symbol}>
                        <td data-label="Asset"><strong>{p.symbol}</strong><small>{p.quote.name}</small></td>
                        <td data-label="Shares">{p.shares}</td>
                        <td data-label="Average cost">{money(Math.round(p.costBasisCents/p.shares))}</td>
                        <td data-label="Market value">{money(p.marketValueCents)}</td>
                        <td data-label="Profit / loss" className={p.profitCents>=0?'positive':'negative'}>{signedMoney(p.profitCents)}</td>
                        <td data-label="Action"><button type="button" className="small-action" onClick={()=>openStock(p.symbol,'SELL')}>Trade <ArrowUpRight size={14}/></button></td>
                      </tr>)}</tbody></table></div>}/>
                  :tab==='leaderboard' ? <FitPager items={leaders} rowHeight={65} compactRowHeight={72} empty="No traders yet."
                    render={(items,start)=><div className="full-leaderboard">{items.map((leader,i)=><div key={leader.userId} className={'full-leader-row '+(leader.userId===account.id?'self':'')}>
                      <span className="rank">#{start+i+1}</span>
                      <ProfileAvatar className="leader-avatar" url={leader.avatarUrl} name={leader.displayName}/>
                      <span className="full-leader-name"><strong>{leader.displayName}</strong>{leader.userId===account.id&&<small>YOU</small>}</span>
                      <span className="full-leader-value"><strong>{money(leader.equityCents)}</strong>
                        <small className={leader.changeCents>=0?'positive':'negative'}>{signedMoney(leader.changeCents)} all time</small>
                      </span>
                    </div>)}</div>}/>
                  : <FitPager items={trades} rowHeight={62} compactRowHeight={158} compactBreakpoint={930} overhead={45} empty="No executed trades."
                    render={items=><div className="responsive-table"><table>
                      <thead><tr><th>Order</th><th>Symbol</th><th>Shares</th><th>Fill price</th><th>Total</th><th>Time</th></tr></thead>
                      <tbody>{items.map(trade=><tr key={trade.id}>
                        <td data-label="Order"><span className={'order-side '+trade.side.toLowerCase()}>{trade.side==='BUY'?<ArrowDownLeft size={14}/>:<ArrowUpRight size={14}/>} {trade.side}</span></td>
                        <td data-label="Symbol"><strong>{trade.symbol}</strong></td>
                        <td data-label="Shares">{trade.shares}</td>
                        <td data-label="Fill price">{money(trade.priceCents)}</td>
                        <td data-label="Total">{money(trade.shares*trade.priceCents)}</td>
                        <td data-label="Time">{new Date(trade.executedAt*1000).toLocaleString()}</td>
                      </tr>)}</tbody></table></div>}/>
                  }
              </section></div>}
              
            </>}
          </div>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {links.map(({ id, label, mobileLabel, icon: Icon }) => {
          const active = tab === id || (tab === 'stock' && id === 'trade');
          return <button key={id} type="button" className={active ? 'active' : ''}
            aria-current={active ? 'page' : undefined} onClick={() => goToPage(id)}>
            <Icon size={20} aria-hidden="true"/><span>{mobileLabel ?? label}</span>
          </button>;
        })}
      </nav>
    </div>
  );
}

function TradeTicket({selected,side,setSide,shares,setShares,total,positionShares,canTrade,pending,execute,portfolio,orderKind,setOrderKind,triggerPrice,setTriggerPrice,viewOrders}:{
  selected?:Quote;side:'BUY'|'SELL';setSide:(v:'BUY'|'SELL')=>void;shares:string;setShares:(v:string)=>void;
  total:number;positionShares:number;canTrade:boolean;pending:boolean;execute:()=>void;portfolio:Portfolio|null;
  orderKind:'IMMEDIATE'|OrderKind;setOrderKind:(v:'AUTO'|'IMMEDIATE'|OrderKind)=>void;
  triggerPrice:string;setTriggerPrice:(v:string)=>void;viewOrders:()=>void;
}) {
  const [step,setStep]=useState<0|1|2>(0);
  const max=side==='BUY'&&selected?Math.min(100_000,Math.floor((portfolio?.cashCents??0)/selected.priceCents)):Math.min(100_000,positionShares);
  const queued=orderKind!=='IMMEDIATE';
  const heading=['Order type','Quantity','Review order'][step];
  return <section className="panel trade-panel">
    <div className="panel-heading"><h2><ArrowLeftRight size={19}/> {heading}</h2><span className="trade-tag">{queued?'QUEUED':'IMMEDIATE'}</span></div>
    <div className="ticket-body staged-ticket">
      {step===0 && <>
        <div className="side-selector"><button type="button" className={side==='BUY'?'current buy':''} aria-pressed={side==='BUY'} onClick={()=>setSide('BUY')}>Buy</button>
          <button type="button" className={side==='SELL'?'current sell':''} aria-pressed={side==='SELL'} onClick={()=>setSide('SELL')}>Sell</button></div>
        <div className="ticket-order-control"><label htmlFor="order-kind">ORDER TYPE</label>
          <select id="order-kind" className="trade-kind" value={orderKind} onChange={e=>setOrderKind(e.target.value as 'IMMEDIATE'|OrderKind)}>
            {selected?.marketOpen && <option value="IMMEDIATE">Immediate market order</option>}
            <option value="MARKET">Queue market order</option>
            <option value="LIMIT">Queue limit order</option>
            <option value="STOP">Queue stop order</option>
          </select></div>
        <button type="button" className="execute-button buy" disabled={!selected} onClick={()=>setStep(1)}>Next <ChevronRight size={17}/></button>
      </>}
      {step===1 && <>
        <label className="field-label" htmlFor="shares">SHARES <span>{side==='BUY'?'CASH':'OWNED'}: {side==='BUY'?money(portfolio?.cashCents??0):positionShares}</span></label>
        <div className="quantity-wrapper"><input id="shares" type="number" inputMode="numeric" min="1" max="100000" step="1" value={shares} onChange={e=>setShares(e.target.value)}/><span>SHARES</span></div>
        <div className="quantity-presets">{[1,5,10].map(n=><button type="button" key={n} onClick={()=>setShares(String(n))} disabled={n>max}>{n}</button>)}<button type="button" onClick={()=>setShares(String(max))} disabled={max<1}>Max</button></div>
        {(orderKind==='LIMIT'||orderKind==='STOP') && <div className="ticket-trigger"><label htmlFor="trigger-price">{orderKind==='LIMIT'?'LIMIT USD':'STOP USD'}</label>
          <input id="trigger-price" className="trigger-input" type="number" min=".01" step=".01" inputMode="decimal" placeholder="0.00" value={triggerPrice} onChange={e=>setTriggerPrice(e.target.value)}/></div>}
        <div className="ticket-step-actions"><button type="button" className="subtle-link" onClick={()=>setStep(0)}><ArrowLeft size={16}/> Back</button>
          <button type="button" className="execute-button buy" disabled={!canTrade} onClick={()=>setStep(2)}>Review <ChevronRight size={16}/></button></div>
      </>}
      {step===2 && <>
        <div className="ticket-asset"><span className="ticket-asset-name"><span className="ticker-icon">{selected?.symbol.slice(0,2)??'??'}</span><strong>{side} {shares} {selected?.symbol??'stock'}</strong></span>
          <strong>{selected?money(selected.priceCents):'—'}</strong></div>
        <div className="ticket-breakdown"><div className="ticket-total"><span>{queued?'Estimated value':'Estimated '+(side==='BUY'?'cost':'proceeds')}</span><strong>{money(total)}</strong></div></div>
        <p className="ticket-disclaimer">{queued?'Executes when the market reopens or conditions match. Funds checked at execution.':'Immediate fills use verified regular-session prices.'}</p>
        <button type="button" className={'execute-button '+side.toLowerCase()} disabled={!canTrade||pending} onClick={execute}>
          {pending?<LoaderCircle size={17} className="spin"/>:<Clock3 size={17}/>}
          {pending?'Processing…':(queued?'Queue ':'')+(side==='BUY'?'Buy ':'Sell ')+(selected?.symbol??'shares')}
        </button>
        <div className="ticket-step-actions"><button type="button" className="subtle-link" onClick={()=>setStep(1)}><ArrowLeft size={16}/> Back</button>
          <button type="button" className="subtle-link" onClick={viewOrders}>Queued orders <ChevronRight size={15}/></button></div>
      </>}
    </div>
  </section>;
}

function DesktopTradeTicket({selected,side,setSide,shares,setShares,total,positionShares,canTrade,pending,execute,portfolio,orderKind,setOrderKind,triggerPrice,setTriggerPrice,viewOrders}:{
  selected?:Quote;side:'BUY'|'SELL';setSide:(v:'BUY'|'SELL')=>void;shares:string;setShares:(v:string)=>void;
  total:number;positionShares:number;canTrade:boolean;pending:boolean;execute:()=>void;portfolio:Portfolio|null;
  orderKind:'IMMEDIATE'|OrderKind;setOrderKind:(v:'AUTO'|'IMMEDIATE'|OrderKind)=>void;
  triggerPrice:string;setTriggerPrice:(v:string)=>void;viewOrders:()=>void;
}) {
  const max=side==='BUY'&&selected?Math.min(100_000,Math.floor((portfolio?.cashCents??0)/selected.priceCents)):Math.min(100_000,positionShares);
  const queued=orderKind!=='IMMEDIATE';
  return <section className="panel trade-panel trade-panel-desktop" aria-label="Desktop order ticket">
    <div className="panel-heading"><h2><ArrowLeftRight size={19}/> Order ticket</h2><span className="trade-tag">{queued?'QUEUED':'IMMEDIATE'}</span></div>
    <div className="ticket-body">
      <div className="side-selector">
        <button type="button" className={side==='BUY'?'current buy':''} aria-pressed={side==='BUY'} onClick={()=>setSide('BUY')}>Buy</button>
        <button type="button" className={side==='SELL'?'current sell':''} aria-pressed={side==='SELL'} onClick={()=>setSide('SELL')}>Sell</button>
      </div>
      <div className="ticket-order-control">
        <label htmlFor="desktop-order-kind">ORDER TYPE</label>
        <select id="desktop-order-kind" className="trade-kind" value={orderKind} onChange={e=>setOrderKind(e.target.value as 'IMMEDIATE'|OrderKind)}>
          {selected?.marketOpen&&<option value="IMMEDIATE">Immediate market order</option>}
          <option value="MARKET">Queue market order</option>
          <option value="LIMIT">Queue limit order</option>
          <option value="STOP">Queue stop order</option>
        </select>
      </div>
      {(orderKind==='LIMIT'||orderKind==='STOP')&&<div className="ticket-trigger">
        <label htmlFor="desktop-trigger-price">{orderKind==='LIMIT'?'LIMIT PRICE (USD)':'STOP PRICE (USD)'}</label>
        <input id="desktop-trigger-price" className="trigger-input" type="number" min=".01" step=".01" inputMode="decimal"
          placeholder="0.00" value={triggerPrice} onChange={e=>setTriggerPrice(e.target.value)}/>
      </div>}
      <label className="field-label" htmlFor="desktop-shares">SHARES <span>{side==='BUY'?'CASH':'OWNED'}: {side==='BUY'?money(portfolio?.cashCents??0):positionShares}</span></label>
      <div className="quantity-wrapper"><input id="desktop-shares" type="number" inputMode="numeric" min="1" max="100000" step="1"
        value={shares} onChange={e=>setShares(e.target.value)}/><span>SHARES</span></div>
      <div className="quantity-presets">
        {[1,5,10].map(n=><button type="button" key={n} onClick={()=>setShares(String(n))} disabled={n>max}>{n}</button>)}
        <button type="button" onClick={()=>setShares(String(max))} disabled={max<1}>Max</button>
      </div>
      <div className="ticket-breakdown"><div className="ticket-total"><span>{queued?'Estimated value':'Estimated '+(side==='BUY'?'cost':'proceeds')}</span><strong>{money(total)}</strong></div></div>
      <button type="button" className={'execute-button '+side.toLowerCase()} disabled={!canTrade||pending} onClick={execute}>
        {pending?<LoaderCircle size={17} className="spin"/>:<ArrowLeftRight size={17}/>}
        {pending?'Processing…':(queued?'Queue ':'')+(side==='BUY'?'Buy ':'Sell ')+(selected?.symbol??'shares')}
      </button>
      <button type="button" className="subtle-link" onClick={viewOrders}>Queued orders <ChevronRight size={15}/></button>
    </div>
  </section>;
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
