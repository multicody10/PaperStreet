import type { SymbolCode } from './stocks';

export type OrderSide = 'BUY' | 'SELL';
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
