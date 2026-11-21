import { useState, type KeyboardEvent } from 'react';
import type { Candle, ChartHistory, HistoryRange, Quote } from '../shared/stocks';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const money = (cents: number) => usd.format(cents / 100);
const et = 'America/New_York';
const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: et });
const dayTime = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: et });
const fullDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: et });
const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: et });
const fields = [['Open', 'openCents'], ['High', 'highCents'], ['Low', 'lowCents'], ['Close', 'closeCents']] as const;

export function DayRange({ quote }: { quote: Quote }) {
  const bar = quote.sessionBar;
  if (!bar) return <span className="range-unavailable" aria-label="Session range unavailable">—</span>;
  const { lowCents, highCents } = bar;
  const percent = highCents === lowCents ? 50 : (quote.priceCents - lowCents) / (highCents - lowCents) * 100;
  return <span className="day-range" title={`Session low ${money(lowCents)} · Last ${money(quote.priceCents)} · High ${money(highCents)}`}>
    <span className="range-track"><i style={{ left: percent + '%' }}/></span>
    <span className="range-ends"><span>{money(lowCents)}</span><span>{money(highCents)}</span></span>
  </span>;
}

function intervalLabel(seconds: number) {
  if (seconds < 3600) return `${seconds / 60} min`;
  if (seconds < 86400) return `${seconds / 3600} hr`;
  if (seconds === 7 * 86400) return 'Weekly';
  return seconds === 86400 ? 'Daily' : `${seconds / 86400} day`;
}

export function PriceChart({ history, quote, range, error }: {
  history?: ChartHistory; quote?: Quote; range: HistoryRange; error?: string;
}) {
  const [inspectedAt, setInspectedAt] = useState<number | null>(null);
  const recorded = history?.candles ?? [];
  const count = recorded.reduce((total, bar) => total + bar.samples, 0);
  const session = count < 2 && quote?.sessionBar;
  let bars = recorded;
  let caption = `${intervalLabel(history?.bucketSeconds ?? 900)} sampled candles`;
  if (session && quote) {
    bars = [{ ...session, firstAt: quote.fetchedAt, lastAt: quote.fetchedAt, samples: 0 }];
    caption = 'Latest session candle';
  } else if (!bars.length && quote) {
    const price = quote.priceCents;
    bars = [{ firstAt: quote.fetchedAt, lastAt: quote.fetchedAt, samples: 1,
      openCents: price, highCents: price, lowCents: price, closeCents: price }];
    caption = 'Latest observed price';
  }
  if (!bars.length) return <div className="chart-placeholder" role="status">
    {error ? 'Price history is unavailable.' : history ? 'No recorded prices in this range.' : 'Loading price history…'}
  </div>;

  const lastIndex = bars.length - 1;
  const match = bars.findIndex(bar => bar.lastAt === inspectedAt);
  const index = match < 0 ? lastIndex : match;
  const active = bars[index];
  const low = Math.min(...bars.map(bar => bar.lowCents));
  const high = Math.max(...bars.map(bar => bar.highCents));
  const pad = Math.max((high - low) * 0.12, 2);
  const bottom = Math.max(0, Math.floor(low - pad));
  const top = Math.ceil(high + pad);
  const y = (price: number) => 100 * (top - price) / (top - bottom);
  const x = (i: number) => 100 * (i + 0.5) / bars.length;
  const candleWidth = Math.min(42, 620 / bars.length);
  const sameDay = fullDay.format(bars[0].firstAt * 1000) === fullDay.format(bars[lastIndex].lastAt * 1000);
  const axisDate = (bar: Candle) => {
    const date = new Date(bar.lastAt * 1000);
    if (bars.length === 1 || range === 'ALL' || range === '1Y') return fullDay.format(date);
    if (range === '1D' || sameDay) return time.format(date);
    return day.format(date);
  };
  const atLabel = dayTime.format(active.lastAt * 1000) + ' ET';
  function inspectKey(event: KeyboardEvent<HTMLDivElement>) {
    const keys: Record<string, number> = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: lastIndex };
    if (!Object.hasOwn(keys, event.key)) return;
    event.preventDefault();
    setInspectedAt(bars[Math.max(0, Math.min(lastIndex, keys[event.key]))].lastAt);
  }
  const singlePrint = !session && active.samples === 1;
  const chartStatus = error ? 'History unavailable' : !history ? 'Loading history…' :
    `${count.toLocaleString()} ${count === 1 ? 'sample' : 'samples'} in ${range}`;
  return <div className="candle-chart">
    <div className="candle-heading"><strong>{caption}</strong><span>{chartStatus}</span></div>
    <div className="bar-readout">{singlePrint ? <span>Print <b>{money(active.closeCents)}</b></span> :
      fields.map(([label, key]) => <span key={key}>{label === 'Close' && session ? 'Last' : label} <b>{money(active[key])}</b></span>)}</div>
    <div className="candle-frame">
      <div className="candle-plot" role="slider" tabIndex={0} aria-label="Inspect price candles"
        aria-valuemin={1} aria-valuemax={bars.length} aria-valuenow={index + 1}
        aria-valuetext={`${atLabel}, open ${money(active.openCents)}, high ${money(active.highCents)}, low ${money(active.lowCents)}, close ${money(active.closeCents)}`}
        onKeyDown={inspectKey} onPointerLeave={() => setInspectedAt(null)}
        onPointerMove={e => {
          const rect = e.currentTarget.getBoundingClientRect();
          const i = Math.floor((e.clientX - rect.left) / rect.width * bars.length);
          setInspectedAt(bars[Math.max(0, Math.min(lastIndex, i))].lastAt);
        }}>
        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
          {[0, 25, 50, 75, 100].map(tick => <line key={tick} x1="0" x2="100%" y1={tick} y2={tick} className="candle-grid"/>)}
          <line x1={x(index) + '%'} x2={x(index) + '%'} y1="0" y2="100" className="candle-guide"/>
          <line x1="0" x2="100%" y1={y(active.closeCents)} y2={y(active.closeCents)} className="candle-guide"/>
          {bars.map((bar, i) => {
            const center = x(i) * 10;
            const direction = bar.closeCents === bar.openCents ? 'flat' : bar.closeCents > bar.openCents ? 'up' : 'down';
            return <g className={`candle ${direction}`} key={bar.firstAt}>
              <line x1={center} x2={center} y1={y(bar.highCents)} y2={y(bar.lowCents)}/>
              <rect x={center - candleWidth / 2} width={candleWidth} y={y(Math.max(bar.openCents, bar.closeCents))}
                height={Math.max(0.8, Math.abs(y(bar.openCents) - y(bar.closeCents)))}/>
            </g>;
          })}
        </svg>
        {session && high > low && <>
          <span className="candle-extreme candle-high" style={{ top: y(high) + '%' }}>High {money(high)}</span>
          <span className="candle-extreme candle-low" style={{ top: y(low) + '%' }}>Low {money(low)}</span>
        </>}
      </div>
      <div className="candle-scale">{[top, Math.round((top + bottom) / 2), bottom].map((p, i) => <span key={i}>{money(p)}</span>)}</div>
    </div>
    <div className="candle-times">{[...new Set([0, Math.floor(lastIndex / 2), lastIndex])].map(i =>
      <span key={i} style={{ left: x(i) + '%', transform: bars.length === 1 ? 'translateX(-50%)' : i === 0 ? 'none' : i === lastIndex ? 'translateX(-100%)' : 'translateX(-50%)' }}>{axisDate(bars[i])}</span>)}</div>
    <div className="candle-foot"><span>{atLabel}</span><span>{session ? 'Finnhub session OHLC' : singlePrint ? 'Single observation' : `${active.samples} observations in candle`}</span></div>
  </div>;
}
