import { Hono } from 'hono';
import { allQuotes, quoteFor, simulatedHistory, type MarketEnv } from './market';
import { createSession, verifySession } from './session';
import { isSymbol, STARTING_CASH_CENTS, STOCKS, type Leader, type Portfolio, type Position, type Quote, type SymbolCode } from '../shared/stocks';

type Bindings = MarketEnv & { DISCORD_CLIENT_ID: string; DISCORD_CLIENT_SECRET: string; SESSION_SECRET: string };
type App = { Bindings: Bindings; Variables: { userId: string } };
type PlayerRow = { user_id: string; display_name: string; cash_cents: number };
type HoldingRow = { symbol: SymbolCode; shares: number; cost_basis_cents: number };
const app = new Hono<App>();
const noStore = (body: object, status: 200 | 400 | 401 | 409 | 422 | 429 | 503 = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

app.use('/api/*', async (c, next) => {
  if (!['/api/config', '/api/auth', '/api/health'].includes(c.req.path)) {
    const match = /^Bearer (\S+)$/.exec(c.req.header('Authorization') ?? '');
    if (!match || !c.env.SESSION_SECRET) return c.json({ error: 'Authentication required' }, 401, { 'Cache-Control': 'no-store' });
    const userId = await verifySession(c.env.SESSION_SECRET, match[1]);
    if (!userId) return c.json({ error: 'Session expired. Reopen the Activity.' }, 401, { 'Cache-Control': 'no-store' });
    c.set('userId', userId);
  }
  await next();
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
});

app.get('/api/health', c => c.json({ status: 'ok', service: 'paperstreet' }));
app.get('/api/config', c => noStore({
  clientId: c.env.DISCORD_CLIENT_ID ?? null,
  marketMode: c.env.MARKET_MODE === 'finnhub' ? 'finnhub' : 'simulated',
  startingCashCents: STARTING_CASH_CENTS,
}));

app.post('/api/auth', async c => {
  if (!c.env.DISCORD_CLIENT_ID || !c.env.DISCORD_CLIENT_SECRET || !c.env.SESSION_SECRET) {
    return noStore({ error: 'Discord credentials are not configured on the Worker' }, 503);
  }
  if (Number(c.req.header('Content-Length') ?? 0) > 2048) return noStore({ error: 'Invalid authorization request' }, 400);
  const input = await c.req.json().catch(() => null) as { code?: unknown } | null;
  if (typeof input?.code !== 'string' || input.code.length < 8 || input.code.length > 512) return noStore({ error: 'Invalid authorization code' }, 400);
  const exchange = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.env.DISCORD_CLIENT_ID, client_secret: c.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code', code: input.code }), signal: AbortSignal.timeout(5000),
  });
  if (!exchange.ok) return noStore({ error: 'Discord authorization failed' }, 401);
  const token = await exchange.json() as { access_token?: string; token_type?: string; expires_in?: number };
  if (!token.access_token || token.token_type?.toLowerCase() !== 'bearer') return noStore({ error: 'Discord token was invalid' }, 401);
  const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(5000),
  });
  if (!userResponse.ok) return noStore({ error: 'Could not verify Discord identity' }, 401);
  const user = await userResponse.json() as { id?: string; username?: string; global_name?: string | null };
  if (!user.id || !/^\d{15,22}$/.test(user.id)) return noStore({ error: 'Invalid Discord user' }, 401);
  const displayName = (user.global_name || user.username || 'Trader').slice(0, 48);
  await c.env.DB.prepare(`INSERT INTO players (user_id,display_name) VALUES (?,?)
    ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name`).bind(user.id, displayName).run();
  const session = await createSession(c.env.SESSION_SECRET, user.id);
  return noStore({ access_token: token.access_token, session, user: { id: user.id, displayName } });
});

app.get('/api/market', async c => {
  const quotes = await allQuotes(c.env);
  if (!quotes.length) return noStore({ error: 'Market prices are temporarily unavailable' }, 503);
  return noStore({ quotes, totalSymbols: STOCKS.length, mode: c.env.MARKET_MODE === 'finnhub' ? 'finnhub' : 'simulated' });
});

app.get('/api/chart', c => {
  const symbol = c.req.query('symbol');
  if (!isSymbol(symbol)) return noStore({ error: 'Invalid stock symbol' }, 422);
  if (c.env.MARKET_MODE === 'finnhub') return noStore({ points: [], available: false });
  return noStore({ points: simulatedHistory(symbol), available: true });
});

app.get('/api/portfolio', async c => {
  const userId = c.get('userId');
  const player = await c.env.DB.prepare('SELECT user_id, display_name, cash_cents FROM players WHERE user_id = ?').bind(userId).first<PlayerRow>();
  if (!player) return noStore({ error: 'Player not found. Reopen the Activity.' }, 401);
  const { results } = await c.env.DB.prepare('SELECT symbol, shares, cost_basis_cents FROM holdings WHERE user_id = ? ORDER BY symbol').bind(userId).all<HoldingRow>();
  const quotes = await Promise.all(results.map(h => quoteFor(h.symbol, c.env)));
  const positions: Position[] = results.map((holding, i) => {
    const quote = quotes[i];
    const marketValueCents = quote.priceCents * holding.shares;
    return { symbol: holding.symbol, shares: holding.shares, costBasisCents: holding.cost_basis_cents,
      marketValueCents, profitCents: marketValueCents - holding.cost_basis_cents, quote };
  });
  const investedCents = positions.reduce((total, position) => total + position.marketValueCents, 0);
  const portfolio: Portfolio = { userId, displayName: player.display_name, cashCents: player.cash_cents,
    investedCents, equityCents: player.cash_cents + investedCents, profitCents: player.cash_cents + investedCents - STARTING_CASH_CENTS, positions };
  return noStore({ portfolio });
});

app.get('/api/history', async c => {
  const trades = await c.env.DB.prepare(`SELECT id,symbol,side,shares,price_cents AS priceCents,executed_at AS executedAt
    FROM trades WHERE user_id=? ORDER BY id DESC LIMIT 30`).bind(c.get('userId')).all();
  return noStore({ trades: trades.results });
});

app.get('/api/leaderboard', async c => {
  // Refresh the small shared price table before calculating every player's mark-to-market equity.
  // This is a global ranking, not a ranking of one unverified guild ID.
  const quotes = await allQuotes(c.env);
  if (quotes.length !== STOCKS.length || quotes.some(q => q.stale)) return noStore({ error: 'Leaderboard unavailable while market quotes are stale' }, 503);
  const { results } = await c.env.DB.prepare(`SELECT p.user_id AS userId, p.display_name AS displayName,
    p.cash_cents + COALESCE(SUM(h.shares * q.price_cents),0) AS equityCents
    FROM players p LEFT JOIN holdings h ON h.user_id = p.user_id
    LEFT JOIN quote_cache q ON q.symbol = h.symbol
    GROUP BY p.user_id ORDER BY equityCents DESC, p.created_at ASC LIMIT 25`).all<Omit<Leader, 'changeCents'>>();
  const leaders: Leader[] = results.map(r => ({ ...r, changeCents: r.equityCents - STARTING_CASH_CENTS }));
  return noStore({ leaders });
});

app.post('/api/trade', async c => {
  if (Number(c.req.header('Content-Length') ?? 0) > 2048) return noStore({ error: 'Invalid order' }, 400);
  const input = await c.req.json().catch(() => null) as { symbol?: unknown; side?: unknown; shares?: unknown; expectedPriceCents?: unknown; orderId?: unknown } | null;
  if (!input || !isSymbol(input.symbol) || (input.side !== 'BUY' && input.side !== 'SELL') ||
      !Number.isSafeInteger(input.shares) || Number(input.shares) < 1 || Number(input.shares) > 100_000 ||
      !Number.isSafeInteger(input.expectedPriceCents) || Number(input.expectedPriceCents) <= 0 ||
      typeof input.orderId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.orderId)) {
    return noStore({ error: 'Invalid order fields' }, 422);
  }
  const userId = c.get('userId');
  const existing = await c.env.DB.prepare('SELECT id FROM trades WHERE user_id=? AND client_order_id=?').bind(userId, input.orderId).first<{ id: number }>();
  if (existing) return noStore({ tradeId: existing.id, duplicate: true });
  const quote = await quoteFor(input.symbol, c.env);
  if (quote.stale) return noStore({ error: 'Quote is stale. Trading paused until prices recover.' }, 503);
  if (Math.abs(quote.priceCents / Number(input.expectedPriceCents) - 1) > 0.01) {
    return noStore({ error: 'Price moved by over 1%. Refresh quotes and retry.' }, 409);
  }
  try {
    const result = await c.env.DB.prepare(`INSERT INTO trades(user_id,client_order_id,symbol,side,shares,price_cents)
      VALUES(?,?,?,?,?,?) RETURNING id`).bind(userId, input.orderId, input.symbol, input.side,
      input.shares, quote.priceCents).first<{ id: number }>();
    return noStore({ tradeId: result?.id, symbol: input.symbol, side: input.side, shares: input.shares, fillPriceCents: quote.priceCents });
  } catch (error) {
    const message = String(error);
    if (message.includes('UNIQUE constraint failed')) {
      const previous = await c.env.DB.prepare('SELECT id FROM trades WHERE user_id=? AND client_order_id=?').bind(userId, input.orderId).first<{ id: number }>();
      if (previous) return noStore({ tradeId: previous.id, duplicate: true });
    }
    if (message.includes('Insufficient cash')) return noStore({ error: 'Insufficient buying power' }, 409);
    if (message.includes('Insufficient shares')) return noStore({ error: 'You do not own enough shares' }, 409);
    throw error;
  }
});

app.notFound(() => noStore({ error: 'API route not found' }, 400));
app.onError((error, c) => {
  console.error('PaperStreet API error', error instanceof Error ? error.message : 'Unknown error');
  return c.json({ error: 'Request failed. Please try again.' }, 503, { 'Cache-Control': 'no-store' });
});
export default app;
