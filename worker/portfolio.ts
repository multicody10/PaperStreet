import { discordAvatarUrl } from './avatar';
import { quoteFor, type MarketEnv } from './market';
import { isSymbol, type Portfolio, type Position, type Quote, type SymbolCode } from '../shared/stocks';

type PlayerRow = {
  display_name: string; cash_cents: number; starting_cash_cents: number;
  avatar_hash: string | null; avatar_discriminator: string | null; margin_debt_cents?: number;
};
type HoldingRow = { symbol: SymbolCode; shares: number; cost_basis_cents: number; short?: number };

export async function loadPortfolio(userId: string, env: MarketEnv):
  Promise<{ portfolio: Portfolio; avatarUrl: string } | null> {
  if (!/^\d{15,22}$/.test(userId)) return null;
  const player = await env.DB.prepare(`SELECT display_name,cash_cents,starting_cash_cents,
    avatar_hash,avatar_discriminator,margin_debt_cents FROM players WHERE user_id=?`)
    .bind(userId).first<PlayerRow>();
  if (!player) return null;

  const { results } = await env.DB.prepare(`SELECT symbol,shares,cost_basis_cents,0 AS short
    FROM holdings WHERE user_id=? UNION ALL SELECT symbol,shares,cost_basis_cents,1 AS short FROM short_positions WHERE user_id=? ORDER BY symbol`).bind(userId,userId).all<HoldingRow>();
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
      short: !!holding.short, capitalCents: holding.short ? 2*holding.cost_basis_cents-marketValueCents : marketValueCents,
      profitCents: holding.short ? holding.cost_basis_cents-marketValueCents : marketValueCents-holding.cost_basis_cents, quote: quotes[i],
    };
  });
  const investedCents = positions.reduce((total, position) => total + (position.capitalCents ?? position.marketValueCents), 0);
  const marginDebtCents = player.margin_debt_cents ?? 0;
  const equityCents = player.cash_cents + investedCents - marginDebtCents;
  const portfolio: Portfolio = {
    userId, displayName: player.display_name,
    cashCents: player.cash_cents, startingCashCents: player.starting_cash_cents,
    equityCents, investedCents, marginDebtCents, profitCents: equityCents - player.starting_cash_cents, positions,
  };
  return { portfolio, avatarUrl: discordAvatarUrl(userId, player.avatar_hash, player.avatar_discriminator) };
}
