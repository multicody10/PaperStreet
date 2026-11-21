import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DiscordSDK } from '@discord/embedded-app-sdk';
import {
  ArrowLeftRight, ArrowUpRight, BarChart3, CheckCircle2,
  LayoutDashboard, RefreshCw, Search, TrendingDown,
  TrendingUp, Trophy, Wallet, Award, X,
} from 'lucide-react';
import type { ChartHistory, HistoryRange, Leader, Portfolio, Quote, SymbolCode, Trade } from '../shared/stocks';
import { STARTING_CASH_CENTS, STOCKS } from '../shared/stocks';
import { appHash, parseAppHash, type Page, type View } from './navigation';
import { money } from './PriceChart';
import { Challenges, OrderList } from './Challenges';
import { PortfolioHistory } from './PortfolioHistory';
import { StockTerminal } from './StockTerminal';
import { TradingDashboard } from './TradingDashboard';
import { TradeTerminal } from './TradeTerminal';
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
import './trade-terminal.css';
import './goals-portfolio.css';
import './stock-terminal.css';
import './flat-terminal.css';
import './overview.css';
import './activity-shell.css';
import brandMark from './assets/paperstreet-mark.svg';
import { Overview } from './Overview';

type Config = { clientId: string | null; provider: 'finnhub'; dataConfigured: boolean; startingCashCents: number };
type Account = { id: string; displayName: string; avatarUrl: string };
const signedMoney = (cents: number) => `${cents > 0 ? '+' : ''}${money(cents)}`;
const pct = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong';
const short = (value: string, max = 22) => value.length > max ? `${value.slice(0, max)}…` : value;
const links: { id: Page; label: string; icon: typeof LayoutDashboard; mobileLabel?: string }[] = [
  { id: 'dashboard', label: 'Overview', mobileLabel: 'Home', icon: LayoutDashboard },
  { id: 'trade', label: 'Markets', icon: ArrowLeftRight },
  { id: 'portfolio', label: 'Portfolio', icon: Wallet },
  { id: 'leaderboard', label: 'Leaderboard', mobileLabel: 'Ranks', icon: Trophy },
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
  const [analytics, setAnalytics] = useState(false);
  const [quickSearch,setQuickSearch] = useState('');
  const [history, setHistory] = useState<{ key: string; data?: ChartHistory; error?: string }>();
  const [historyRange, setHistoryRange] = useState<HistoryRange>('1W');
  const [stockPane, setStockPane] = useState<'chart'|'order'|'facts'|'predict'>('chart');
  const [portfolioPane, setPortfolioPane] = useState<'positions'|'orders'|'history'>(()=>window.location.hash==='#/history'?'history':'positions');
  const historyKey = `${selectedSymbol}:${historyRange}`;
  const currentHistory = history?.key === historyKey ? history : undefined;

  function goToPage(page: Page) {
    if (page === 'dashboard') setAnalytics(false);
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
      if(window.location.hash==='#/history')setPortfolioPane('history');
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
    // The market ticker is global, including when Goals or Portfolio opens directly.
    jobs.push(request<{ quotes: Quote[] }>('/api/market', session).then(({ quotes }) => setQuotes(quotes)));
    if (view === 'dashboard' || view === 'portfolio' || view === 'stock' || view === 'challenges')
      jobs.push(request<{ portfolio: Portfolio }>('/api/portfolio', session).then(({ portfolio }) => setPortfolio(portfolio)));
    if (view === 'dashboard' || view === 'leaderboard')
      jobs.push(request<{ leaders: Leader[] }>('/api/leaderboard', session).then(({ leaders }) => setLeaders(leaders)));
    if (view === 'dashboard' || view === 'portfolio' || view === 'stock')
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
        if (window.self === window.top) { setAuthStatus('Guest session'); return; }
        if (!settings.clientId || !/^\d{15,22}$/.test(settings.clientId)) throw new Error('Set DISCORD_CLIENT_ID in your Cloudflare Worker secrets.');
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
    if (!token || (tab !== 'stock' && tab !== 'trade' && tab !== 'dashboard')) return;
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
  const refreshNow = () => {
    if (!token || loading) return;
    setFeedback(null);
    setLoading(true);
    void refresh(token, tab).finally(() => setLoading(false));
  };

  async function execute() {
    if (tab !== 'stock' || !canSubmitOrder || !selected || !token || pending) return;
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

  const overview = (tab === 'dashboard' && (!account || !analytics)) || (!account && tab === 'trade');
  const title = tab === 'dashboard' ? 'Dashboard' :
    tab === 'trade' ? 'Trade' :
    tab === 'portfolio' ? 'Portfolio' :
    tab === 'challenges' ? 'Goals' :
    tab === 'leaderboard' ? 'Leaderboard' :
    selected?.name ?? selectedSymbol;

  return (
    <div className="app-shell activity-theme">
      <header className="global-header">
        <div className="brand" aria-label="PaperStreet">
          <img className="activity-brand-mark" src={brandMark} alt=""/>
          <span className="brand-words"><strong>Paper<span>Street</span></strong></span>
        </div>
        <div className="header-market" aria-label="Market status and selected real quotes">
          <div className={'header-market-status '+(quotes.length&&quotes.some(q=>q.marketOpen)?'open':'closed')}>
            <span className="status-dot"/>{!quotes.length?'Quotes pending':quotes.some(q=>q.marketOpen)?'Markets Open':'Markets Closed'}
          </div>
          {(['SPY','AAPL','NVDA'] as SymbolCode[]).map(symbol=>{
            const quote=quotes.find(q=>q.symbol===symbol);
            return quote?<div className="header-ticker" key={symbol}><strong>{symbol}</strong><span>{money(quote.priceCents)}</span>
              <b className={quote.changePct>=0?'positive':'negative'}>{quote.changePct>=0?<TrendingUp size={16} strokeWidth={2.8}/>:<TrendingDown size={16} strokeWidth={2.8}/>} {pct(quote.changePct)}</b></div>:null;
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
                <Icon size={22} aria-hidden="true"/><span>{mobileLabel ?? label}</span><span className="full-label">{label}</span>
              </button>;
            })}
          </nav>
        </aside>
        <main className="main-content" data-page={tab}>
          <div className="content-wrap">
            {tab !== 'stock' && tab !== 'dashboard' && tab !== 'trade' && tab !== 'challenges' && <div className="headline"><h1>{title}</h1></div>}
            {overview ? <>
              {(authError || feedback) && <p className="feedback error" role="alert">{authError || feedback?.message}</p>}
              <Overview key={tab} markets={tab === 'trade'} portfolio={portfolio} quotes={quotes} trades={trades} leaders={leaders}
                userId={account?.id} startingCash={config?.startingCashCents ?? STARTING_CASH_CENTS}
                onStock={openStock} onMarkets={()=>goToPage('trade')} onAnalytics={()=>setAnalytics(true)}
                onPortfolio={()=>goToPage('portfolio')} onRankings={()=>goToPage('leaderboard')}
                onHistory={()=>{setPortfolioPane('history');goToPage('portfolio')}}/>
            </> : !account ? <section className="welcome-panel"><div className="welcome-icon"><BarChart3 size={30}/></div><h2>{tab === 'stock' ? selectedSymbol + ' · ' + STOCKS.find(s=>s.symbol===selectedSymbol)?.name : 'Your trading account'}</h2><p>Connect through the Discord App Launcher to start trading stocks using virtual cash.</p><div className="auth-status" role="status">{authError || authStatus}</div><button className="small-action" type="button" onClick={()=>goToPage('trade')}>Browse markets</button><small>PaperStreet is a game. No real money is exchanged.</small></section> : <>
              {!config?.dataConfigured && <div className="feedback error" role="alert"><span><X size={17}/> Market data is not configured. The operator must add FINNHUB_API_KEY as a Cloudflare Worker secret.</span></div>}
              {feedback && <div className={`feedback ${feedback.kind}`} role="status"><span>{feedback.kind === 'ok' ? <CheckCircle2 size={17}/> : <X size={17}/>} {feedback.message}</span><button type="button" aria-label="Dismiss notice" onClick={() => setFeedback(null)}><X size={16}/></button></div>}

              {(tab === 'portfolio' || tab === 'leaderboard') && <section className={'page-insights '+(tab === 'leaderboard'?'leaderboard-insights':'')} aria-label={tab === 'portfolio'?'Portfolio summary':'Leaderboard summary'}>
                 {tab === 'portfolio' ? <>
                   <div className="panel page-insight"><span>Account equity</span><strong>{portfolio?money(portfolio.equityCents):'—'}</strong><small>Virtual account balance</small></div>
                   <div className="panel page-insight"><span>Available cash</span><strong>{portfolio?money(portfolio.cashCents):'—'}</strong><small>Buying power</small></div>
                   <div className="panel page-insight"><span>Invested</span><strong>{portfolio?money(portfolio.investedCents):'—'}</strong><small>{portfolio?portfolio.positions.length:0} open positions</small></div>
                   <div className="panel page-insight"><span>Total return</span><strong className={portfolio?(portfolio.profitCents>=0?'positive':'negative'):''}>{portfolio?signedMoney(portfolio.profitCents):'—'}</strong><small>Since account creation</small></div>
                 </> : <>
                   <div className="panel page-insight"><span>Ranked traders</span><strong>{leaders.length}</strong><small>Active leaderboard entries</small></div>
                   <div className="panel page-insight"><span>Leading equity</span><strong>{leaders[0]?money(leaders[0].equityCents):'—'}</strong><small>{leaders[0]?short(leaders[0].displayName):'No ranked traders'}</small></div>
                   <div className="panel page-insight"><span>Your rank</span><strong>{leaders.findIndex(leader=>leader.userId===account?.id)>=0?'#'+(leaders.findIndex(leader=>leader.userId===account.id)+1):'—'}</strong><small>{leaders.some(leader=>leader.userId===account.id)?'Your position':'Not on leaderboard'}</small></div>
                 </>}
               </section>}
               {tab === 'portfolio' && <SectionTabs label="Portfolio panels" value={portfolioPane} onChange={setPortfolioPane}
                items={[{id:'positions',label:'Positions'},{id:'orders',label:'Queued orders'},{id:'history',label:'History'}]}/>}
              {tab === 'dashboard' ? <TradingDashboard
                portfolio={portfolio} quotes={quotes} trades={trades} achievements={achievements}
                selectedSymbol={selectedSymbol} setSelectedSymbol={setSelectedSymbol}
                onOpenStock={symbol=>openStock(symbol)} onNavigate={goToPage}
                onHistory={()=>{setPortfolioPane('history');goToPage('portfolio')}}
                selected={selected} history={currentHistory?.data} historyError={currentHistory?.error}
                range={historyRange} setRange={setHistoryRange}
              /> : tab === 'trade' ? <TradeTerminal
                quotes={quotes} selectedSymbol={selectedSymbol} openStock={symbol=>openStock(symbol)}
                history={currentHistory?.data} historyError={currentHistory?.error}
                range={historyRange} setRange={setHistoryRange}
              /> : tab === 'stock' ? <StockTerminal
                symbol={selectedSymbol} quote={selected} quotes={quotes} portfolio={portfolio} trades={trades}
                history={currentHistory?.data} historyError={currentHistory?.error}
                range={historyRange} setRange={setHistoryRange} pane={stockPane} setPane={setStockPane}
                onBack={()=>goToPage('trade')} openStock={symbol=>openStock(symbol)} openPortfolio={()=>goToPage('portfolio')}
                side={side} setSide={setSide} shares={shares} setShares={setShares}
                orderKind={effectiveOrderKind} setOrderKind={setOrderKind} triggerPrice={triggerPrice} setTriggerPrice={setTriggerPrice}
                total={total} canSubmit={canSubmitOrder} pending={pending} execute={()=>void execute()}
                predictions={predictions} forecastPending={forecastPending} submitForecast={(symbol,direction)=>void submitForecast(symbol,direction)}
              /> : tab === 'challenges' ? <Challenges achievements={achievements} portfolio={portfolio}/> : <div className={tab === 'portfolio' ? 'details-stack portfolio-stack' : 'details-stack'} data-pane={tab === 'portfolio' ? portfolioPane : 'positions'}>
                {tab === 'portfolio' && <OrderList orders={orders} onCancel={id => void cancelQueuedOrder(id)} canceling={cancelingOrder}/>}
                 {tab === 'portfolio' && <PortfolioHistory trades={trades}/>}
                <section className="panel details-panel">
                  <div className="panel-heading details-heading">
                    <h2>{tab==='portfolio'?'Positions':'Top traders'}</h2>
                    <span className="count-pill">{tab==='portfolio'?(portfolio?.positions.length??0)+' POSITIONS':leaders.length+' TRADERS'}</span>
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
                  : <FitPager items={leaders} rowHeight={65} compactRowHeight={72} empty="No traders yet."
                    render={(items,start)=><div className="full-leaderboard">{items.map((leader,i)=><div key={leader.userId} className={'full-leader-row '+(leader.userId===account.id?'self':'')}>
                      <span className="rank">#{start+i+1}</span>
                      <ProfileAvatar className="leader-avatar" url={leader.avatarUrl} name={leader.displayName}/>
                      <span className="full-leader-name"><strong>{leader.displayName}</strong>{leader.userId===account.id&&<small>YOU</small>}</span>
                      <span className="full-leader-value"><strong>{money(leader.equityCents)}</strong>
                        <small className={leader.changeCents>=0?'positive':'negative'}>{signedMoney(leader.changeCents)} all time</small>
                      </span>
                    </div>)}</div>}/>
                  
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

function ProfileAvatar({ url, name, className }: { url?: string | null; name: string; className: 'user-avatar' | 'leader-avatar' }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return <span className={className} aria-label={name} role="img">
    {url && failedUrl !== url
      ? <img src={url} alt={name} referrerPolicy="no-referrer" loading="lazy" onError={() => setFailedUrl(url)}/>
      : name.slice(0, 1).toUpperCase() || '?'}
  </span>;
}

createRoot(document.getElementById('root')!).render(<App/>);
