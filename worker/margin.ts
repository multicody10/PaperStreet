import { isQuoteExecutable, isUsMarketOpen, type MarketEnv } from './market';
import { invalidateMemo } from './memo';
import type { Quote } from '../shared/stocks';

// Isolated maintenance margin: locked proceeds + collateral minus repurchase liability
// must be at least 25% of current short exposure. Use integer comparisons.
export async function liquidateUnderMargin(env: MarketEnv, quotes: Quote[], now: number): Promise<number> {
  if (!isUsMarketOpen(now)) return 0;
  const verified = quotes.filter(q=>isQuoteExecutable(q) && isUsMarketOpen(q.fetchedAt) && q.fetchedAt>=now-1200);
  if (!verified.length) return 0;
  // Single atomic insert-select; concurrent covers cannot race the selected quantity.
  const result = await env.DB.prepare(`WITH verified(symbol,price) AS (VALUES ${verified.map(()=>'(?,?)').join(',')})
    INSERT INTO trades(user_id,client_order_id,symbol,side,shares,price_cents,position_effect)
    SELECT s.user_id,'liquidation-'||lower(hex(randomblob(16))),s.symbol,'BUY',s.shares,v.price,'LIQUIDATION'
    FROM short_positions s JOIN verified v ON v.symbol=s.symbol
    WHERE 8*s.cost_basis_cents < 5*s.shares*v.price
    ORDER BY (2*s.cost_basis_cents-s.shares*v.price)*1.0/(s.shares*v.price),s.user_id,s.symbol LIMIT 40`)
    .bind(...verified.flatMap(q=>[q.symbol,q.priceCents])).run();
  const count = result.meta.changes ?? 0;
  if (count) invalidateMemo('leaderboard');
  return count;
}
