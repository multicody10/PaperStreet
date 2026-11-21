import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { portfolioInteraction } from './commands';
import { deployPortfolioCommand } from './registration';
import { inspectProductionDeployIdentity } from './deploy-identity';
import { loadPortfolio } from './portfolio';
import { allQuotes, quoteFor, quoteHistory, isQuoteExecutable, isHistoryRange, isUsMarketOpen, type MarketEnv } from './market';
import { memoized, invalidateMemo } from './memo';
import { createSession, verifySession } from './session';
import { discordAvatarUrl } from './avatar';
import { listOrders, queueOrder, cancelOrder, listPredictions, getPredictionSummary, submitPrediction, getAchievements, processQueuedOrders, settlePredictions } from './gameplay';
import { isSymbol, STARTING_CASH_CENTS, STOCKS, type Leader } from '../shared/stocks';

type Bindings = MarketEnv & { DISCORD_CLIENT_ID: string; DISCORD_CLIENT_SECRET: string; DISCORD_PUBLIC_KEY?: string; SESSION_SECRET: string };
type App = { Bindings: Bindings; Variables: { userId: string } };
type LeaderRow = Omit<Leader, 'changeCents' | 'avatarUrl'> & { avatarHash: string | null; avatarDiscriminator: string | null };
const app = new Hono<App>();
const noStore = (body: object, status: 200 | 400 | 401 | 409 | 422 | 429 | 503 = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

// Only signed Discord slash-command interactions use this unauthenticated route.
// It never modifies Discord's separate Activity Launch entry point.
app.post('/api/discord/interactions',
  bodyLimit({ maxSize: 32 * 1024, onError: c => c.text('Payload too large', 413) }),
  c => portfolioInteraction(c.req.raw, c.env, c.executionCtx));

// After Wrangler deploy, only the signed GitHub Actions production workflow
// may register slash commands. This endpoint cannot update the Activity Launch.
app.post('/api/internal/register-commands', async c => {
  const identity = await inspectProductionDeployIdentity(
    c.req.header('Authorization'), c.req.url,
  );
  if (!identity.valid) return noStore({ error: 'oidc_' + identity.reason }, 401);
  try {
    const result = await deployPortfolioCommand(c.env);
    return noStore({ command: '/portfolio', result });
  } catch (error) {
    const category = error instanceof Error && /^(?:missing_discord_configuration|(?:oauth|list|create)_(?:network_error|invalid_response|http_\d{3}))$/.test(error.message)
      ? error.message : 'registration_failed';
    console.error('PaperStreet command deployment failed:', category);
    return noStore({ error: category }, 503);
  }
});

app.use('/api/*', async (c, next) => {
  if (!['/api/config', '/api/auth', '/api/health', '/api/commands/status'].includes(c.req.path)) {
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
app.get('/api/commands/status', async c => {
  const state = await c.env.DB.prepare(`SELECT version,checked_at,last_attempt_at,last_result
    FROM discord_command_registry WHERE name='portfolio'`)
    .first<{ version: number; checked_at: number; last_attempt_at: number; last_result: string }>();
  return noStore({
    command: '/portfolio', registered: state?.version === 2 &&
      (state.last_result === 'registered' || state.last_result === 'verified'),
    lastVerifiedAt: state?.checked_at ?? null,
    lastAttemptAt: state?.last_attempt_at ?? null,
    lastResult: state?.last_result ?? 'not_run',
  });
});
app.get('/api/config', c => noStore({
  clientId: c.env.DISCORD_CLIENT_ID ?? null,
  provider: 'finnhub',
  dataConfigured: Boolean(c.env.FINNHUB_API_KEY),
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
  const user = await userResponse.json() as { id?: string; username?: string; global_name?: string | null; avatar?: string | null; discriminator?: string };
  if (!user.id || !/^\d{15,22}$/.test(user.id)) return noStore({ error: 'Invalid Discord user' }, 401);
  const displayName = (user.global_name || user.username || 'Trader').slice(0, 48);
  const avatarHash = user.avatar && /^(?:a_)?[a-f0-9]{32}$/i.test(user.avatar) ? user.avatar.toLowerCase() : null;
  const avatarDiscriminator = user.discriminator && /^\d{4}$/.test(user.discriminator) && user.discriminator !== '0000' ? user.discriminator : null;
  const avatarUrl = discordAvatarUrl(user.id, avatarHash, avatarDiscriminator);
  await c.env.DB.prepare(`INSERT INTO players (user_id,display_name,cash_cents,starting_cash_cents,avatar_hash,avatar_discriminator)
    VALUES (?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name,
    avatar_hash=excluded.avatar_hash, avatar_discriminator=excluded.avatar_discriminator`)
    .bind(user.id, displayName, STARTING_CASH_CENTS, STARTING_CASH_CENTS, avatarHash, avatarDiscriminator).run();
  invalidateMemo('leaderboard');
  const session = await createSession(c.env.SESSION_SECRET, user.id);
  return noStore({ access_token: token.access_token, session, user: { id: user.id, displayName, avatarUrl } });
});

app.get('/api/market', async c => {
  if (!c.env.FINNHUB_API_KEY) return noStore({ error: 'Real market data is not configured on this Worker' }, 503);
  const quotes = await memoized('market:response', 20000, () => allQuotes(c.env));
  if (!quotes.length) return noStore({ error: 'Real market prices are temporarily unavailable' }, 503);
  return noStore({ quotes, totalSymbols: STOCKS.length, provider: 'finnhub' });
});

app.get('/api/chart', async c => {
  const symbol = c.req.query('symbol');
  if (!isSymbol(symbol)) return noStore({ error: 'Invalid stock symbol' }, 422);
  if (!c.env.FINNHUB_API_KEY) return noStore({ error: 'Real market data is not configured on this Worker' }, 503);
  const range = c.req.query('range') ?? '1W';
  if (!isHistoryRange(range)) return noStore({ error: 'Unsupported chart time range' }, 422);
  const history = await quoteHistory(symbol, c.env, range);
  const points = history.candles.map(bar => ({ at: bar.lastAt, priceCents: bar.closeCents }));
  return noStore({ ...history, points, available: points.length >= 2, range, source: 'finnhub' });
});

app.get('/api/portfolio', async c => {
  const result = await loadPortfolio(c.get('userId'), c.env);
  if (!result) return noStore({ error: 'Player not found. Reopen the Activity.' }, 401);
  return noStore({ portfolio: result.portfolio });
});

app.get('/api/history', async c => {
  const trades = await c.env.DB.prepare(`SELECT id,symbol,side,shares,price_cents AS priceCents,executed_at AS executedAt
    FROM trades WHERE user_id=? ORDER BY id DESC LIMIT 30`).bind(c.get('userId')).all();
  return noStore({ trades: trades.results });
});

// All game actions use the same signed Activity session middleware.
app.get('/api/orders', async c => noStore({ orders: await listOrders(c.get('userId'),c.env) }));
app.post('/api/orders', async c => {
  if (Number(c.req.header('Content-Length') ?? 0) > 2048) return noStore({error:'Invalid queued order'},400);
  const input = await c.req.json().catch(()=>null) as {
    symbol?:unknown; side?:unknown; shares?:unknown; kind?:unknown;
    triggerPriceCents?:unknown; orderId?:unknown;
  } | null;
  const kind = input?.kind;
  const price = input?.triggerPriceCents;
  if (!input || !isSymbol(input.symbol) ||
      (input.side!=='BUY' && input.side!=='SELL') ||
      !Number.isSafeInteger(input.shares) || Number(input.shares)<1 || Number(input.shares)>100000 ||
      (kind!=='MARKET' && kind!=='LIMIT' && kind!=='STOP') ||
      (kind==='MARKET' ? price!=null : !Number.isSafeInteger(price) || Number(price)<1 || Number(price)>100000000) ||
      typeof input.orderId!=='string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.orderId))
    return noStore({error:'Invalid queued order fields'},422);
  try {
    const order = await queueOrder(c.env,c.get('userId'),{
      orderId:input.orderId, symbol:input.symbol, side:input.side,
      shares:input.shares as number,kind:kind as 'MARKET'|'LIMIT'|'STOP',
      triggerPriceCents: kind==='MARKET' ? null : price as number,
    });
    return noStore({order});
  } catch(error) {
    const message = error instanceof Error ? error.message : 'Unable to queue order';
    if (message.includes('30 open')) return noStore({error:message},409);
    throw error;
  }
});
app.post('/api/orders/:id/cancel', async c => {
  const id = Number(c.req.param('id'));
  if (!Number.isSafeInteger(id) || id<=0) return noStore({error:'Invalid order'},422);
  if (!await cancelOrder(c.env,c.get('userId'),id))
    return noStore({error:'Order already processed or not found'},409);
  return noStore({canceled:true});
});
app.get('/api/predictions', async c => {
  const userId=c.get('userId');
  const [predictions,summary]=await Promise.all([listPredictions(userId,c.env),getPredictionSummary(userId,c.env)]);
  return noStore({predictions,summary});
});
app.post('/api/predictions', async c => {
  if (Number(c.req.header('Content-Length') ?? 0) > 512) return noStore({error:'Invalid prediction'},400);
  const input = await c.req.json().catch(()=>null) as {symbol?:unknown;direction?:unknown}|null;
  if (!isSymbol(input?.symbol) || (input?.direction!=='UP' && input?.direction!=='DOWN'))
    return noStore({error:'Choose a stock and direction'},422);
  try {
    const prediction = await submitPrediction(c.env,c.get('userId'),input.symbol,input.direction);
    return noStore({prediction});
  } catch(error) {
    const message = error instanceof Error ? error.message : 'Prediction unavailable';
    if (message.includes('already predicted')) return noStore({error:message},409);
    if (message.includes('quote')) return noStore({error:message},503);
    throw error;
  }
});
app.get('/api/achievements', async c =>
  noStore({achievements:await getAchievements(c.env,c.get('userId'))}));

app.get('/api/leaderboard', async c => {
  const quotes = await allQuotes(c.env);
  if (quotes.length !== STOCKS.length || quotes.some(q => q.stale))
    return noStore({ error: 'Leaderboard unavailable while market quotes are stale' }, 503);
  const leaders = await memoized('leaderboard', 15000, async (): Promise<Leader[]> => {
    const { results } = await c.env.DB.prepare(`SELECT p.user_id AS userId, p.display_name AS displayName,
      p.cash_cents + COALESCE(SUM(h.shares * q.price_cents),0) AS equityCents,
      p.starting_cash_cents AS startingCashCents,
      p.avatar_hash AS avatarHash, p.avatar_discriminator AS avatarDiscriminator
      FROM players p LEFT JOIN holdings h ON h.user_id = p.user_id
      LEFT JOIN quote_cache q ON q.symbol = h.symbol
      GROUP BY p.user_id ORDER BY equityCents DESC, p.created_at ASC LIMIT 25`).all<LeaderRow>();
    return results.map(({ avatarHash, avatarDiscriminator, ...row }) => ({
      ...row, avatarUrl: discordAvatarUrl(row.userId, avatarHash, avatarDiscriminator),
      changeCents: row.equityCents - row.startingCashCents,
    }));
  });
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
  if (!isUsMarketOpen()) return noStore({ error: 'The exchange is closed. Queue an order for the next session.' }, 409);
  const quote = await quoteFor(input.symbol, c.env);
  if (!isUsMarketOpen(quote.fetchedAt)) return noStore({ error: 'Waiting for a current regular-session trade print.' }, 409);
  if (!isQuoteExecutable(quote)) return noStore({ error: 'A verified market quote is unavailable or too old. Trading resumes when valid data returns.' }, 503);
  if (Math.abs(quote.priceCents / Number(input.expectedPriceCents) - 1) > 0.01) {
    return noStore({ error: 'Price moved by over 1%. Refresh quotes and retry.' }, 409);
  }
  try {
    const result = await c.env.DB.prepare(`INSERT INTO trades(user_id,client_order_id,symbol,side,shares,price_cents)
      VALUES(?,?,?,?,?,?) RETURNING id`).bind(userId, input.orderId, input.symbol, input.side,
      input.shares, quote.priceCents).first<{ id: number }>();
    invalidateMemo('leaderboard');
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
export default {
  fetch: app.fetch,
  scheduled(controller: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    if (!env.FINNHUB_API_KEY) return;
    const now = Math.floor(controller.scheduledTime / 1000);
    // Wrangler's UTC schedule covers both EST and EDT regular sessions.
    // Holidays, early closures and the buffer around those sessions exit without work.
    if (!isUsMarketOpen(now)) return;
    ctx.waitUntil((async () => {
      // Keep failures in the quote collector from preventing queued-order processing.
      await allQuotes(env).catch(error =>
        console.error('Quote collection failed', error instanceof Error ? error.message : 'Unknown'));
      await processQueuedOrders(env, now);
      // Grade completed sessions on a subsequent open-market run, never while closed.
      await settlePredictions(env, now);
    })().catch(error => {
      console.error('PaperStreet scheduled gameplay failed', error instanceof Error ? error.message : 'Unknown failure');
    }));
  },
} satisfies ExportedHandler<Bindings>;
