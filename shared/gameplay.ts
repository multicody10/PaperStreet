import type { SymbolCode } from './stocks';

export type OrderSide = 'BUY' | 'SELL' | 'SHORT' | 'COVER';
export const isOrderSide = (value: unknown): value is OrderSide =>
  value === 'BUY' || value === 'SELL' || value === 'SHORT' || value === 'COVER';
export const isBuySide = (side: OrderSide | 'LIQUIDATE') => side === 'BUY' || side === 'COVER' || side === 'LIQUIDATE';
export const orderLabel = (side: OrderSide | 'LIQUIDATE') => ({BUY:'Buy',SELL:'Sell',SHORT:'Short',COVER:'Cover',LIQUIDATE:'Liquidated'}[side]);
export const tradeVerb = (side: OrderSide | 'LIQUIDATE') => ({BUY:'Bought',SELL:'Sold',SHORT:'Shorted',COVER:'Covered',LIQUIDATE:'Liquidated'}[side]);
export const ledgerSide = (side: OrderSide) => isBuySide(side) ? 'BUY' : 'SELL';
export const positionEffect = (side: OrderSide) => side === 'SHORT' || side === 'COVER' ? 'SHORT' : 'LONG';
// Only server-selected aliases are passed to this SQL expression.
export const displaySideSql = (prefix = '') => `CASE WHEN ${prefix}position_effect='LIQUIDATION' THEN 'LIQUIDATE' WHEN ${prefix}position_effect='SHORT' THEN CASE WHEN ${prefix}side='BUY' THEN 'COVER' ELSE 'SHORT' END ELSE ${prefix}side END`;
export type OrderKind = 'MARKET' | 'LIMIT' | 'STOP';
export type OrderStatus = 'PENDING' | 'PROCESSING' | 'FILLED' | 'CANCELED' | 'REJECTED';
export type QueuedOrder = {
  id: number; symbol: SymbolCode; side: OrderSide; shares: number; kind: OrderKind;
  triggerPriceCents: number | null; status: OrderStatus; createdAt: number;
  resolvedAt: number | null; fillPriceCents: number | null; failureReason: string | null;
};
export type PredictionDirection = 'UP' | 'DOWN';
export type PredictionOutcome = 'PENDING' | 'CORRECT' | 'INCORRECT' | 'PUSH';
export type Prediction = {
  id: number; symbol: SymbolCode; direction: PredictionDirection; targetDate: string;
  basePriceCents: number; closePriceCents: number | null;
  outcome: PredictionOutcome; points: number; createdAt: number;
};
export type AchievementCode =
  'first_trade' | 'five_trades' | 'twenty_five_trades' |
  'first_prediction' | 'ten_predictions' | 'three_correct' | 'five_assets';
export type Achievement = {
  code: AchievementCode; title: string; description: string;
  progress: number; target: number; unlockedAt: number | null;
};

export type PredictionSummary = { points: number; correct: number; settled: number };
