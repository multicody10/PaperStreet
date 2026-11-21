import { discordAvatarUrl } from './avatar';
import { quoteFor, type MarketEnv } from './market';
import { isSymbol, type Portfolio, type Position, type Quote, type SymbolCode } from '../shared/stocks';

type PlayerRow = {
  display_name: string; cash_cents: number; starting_cash_cents: number;
  avatar_hash: string | null; avatar_discriminator: string | null;
};
type HoldingRow = { symbol: SymbolCode; shares: number; cost_basis_cents: number };

export async function loadPortfolio(userId: string, env: MarketEnv):
  Promise<{ portfolio: Portfolio; avatarUrl: string } | null> {
  if (!/^\d{15,22}$/.test(userId)) return null;
  const player = await env.DB.prepare(`SELECT display_name,cash_cents,starting_cash_cents,
    avatar_hash,avatar_discriminator FROM players WHERE user_id=?`)
    .bind(userId).first<PlayerRow>();
  if (!player) return null;

  const { results } = await env.DB.prepare(`SELECT symbol,shares,cost_basis_cents
    FROM holdings WHERE user_id=? ORDER BY symbol`).bind(userId).all<HoldingRow>();
  const quotes: Quote[] = [];
  // Limit concurrent D1/provider operations within Cloudflare Free's connection budget.
  for (let i = 0; i < results.length; i += 4) {
    const batch = results.slice(i, i + 4);
    if (!batch.every(row => isSymbol(row.symbol))) throw new Error('Unsupported holding symbol');
    quotes.push(...await Promise.all(batch.map(row => quoteFor(row.symbol, env))));
  }
  const positions: Position[] = results.map((holding, i) => {
    const marketValueCents = holding.shares * quotes[i].priceCents;
    return {
      symbol: holding.symbol, shares: holding.shares,
      costBasisCents: holding.cost_basis_cents, marketValueCents,
      profitCents: marketValueCents - holding.cost_basis_cents, quote: quotes[i],
    };
  });
  const investedCents = positions.reduce((total, position) => total + position.marketValueCents, 0);
  const equityCents = player.cash_cents + investedCents;
  const portfolio: Portfolio = {
    userId, displayName: player.display_name,
    cashCents: player.cash_cents, startingCashCents: player.starting_cash_cents,
    equityCents, investedCents, profitCents: equityCents - player.starting_cash_cents, positions,
  };
  return { portfolio, avatarUrl: discordAvatarUrl(userId, player.avatar_hash, player.avatar_discriminator) };
}
