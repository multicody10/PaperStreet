import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, CalendarClock, Target } from 'lucide-react';
import type { Quote, SymbolCode } from '../shared/stocks';
import type { Prediction, PredictionDirection } from '../shared/gameplay';
import { FitPager } from './FitPager';
import { money } from './PriceChart';

export function predictionsForStock(predictions:readonly Prediction[],symbol:SymbolCode):Prediction[] {
  return predictions.filter(p=>p.symbol===symbol).sort((a,b)=>b.createdAt-a.createdAt || b.id-a.id);
}

export function StockPredictions({symbol,quote,predictions,pending,submit}:{
  symbol:SymbolCode;quote?:Quote;predictions:Prediction[];pending:boolean;
  submit:(symbol:SymbolCode,direction:PredictionDirection)=>void;
}) {
  const [direction,setDirection]=useState<PredictionDirection>('UP');
  const [historyMode,setHistoryMode]=useState(false);
  const history=predictionsForStock(predictions,symbol);
  return <section className="panel stock-prediction-panel" aria-label={'Stock predictions for '+symbol}>
    <div className="panel-heading">
      <h2><Target size={18}/> {symbol} prediction</h2>
      <button type="button" className="subtle-link prediction-view-switch" aria-pressed={historyMode}
        onClick={()=>setHistoryMode(value=>!value)}>
        {historyMode?<><Target size={14}/> Predict</>:<><CalendarClock size={14}/> History {history.length}</>}
      </button>
    </div>
    {historyMode
      ? <FitPager items={history} rowHeight={60} compactRowHeight={68} empty={'No predictions for '+symbol}
          render={items=><div className="prediction-list">{items.map(p=><div className="prediction-row" key={p.id}>
            <span><strong className={p.direction==='UP'?'positive':'negative'}>{p.direction==='UP'?'↑ Higher':'↓ Lower'}</strong>
              <small>{p.targetDate} · {money(p.basePriceCents)} baseline</small></span>
            <span className="prediction-outcome">
              <strong className={p.outcome==='CORRECT'?'positive':p.outcome==='INCORRECT'?'negative':''}>
                {p.outcome==='PENDING'?'Pending':p.outcome==='PUSH'?'Tie':p.outcome==='CORRECT'?'Correct':'Missed'}
              </strong>
              <small>{p.closePriceCents?money(p.closePriceCents)+' · ':''}{p.points>0?'+':''}{p.points} pts</small>
            </span>
          </div>)}</div>}/>
      : <div className="stock-prediction-compose">
          <div className="stock-prediction-quote"><span>Next close versus</span>
            <strong>{quote?money(quote.priceCents):'Loading…'}</strong></div>
          <div className="prediction-direction" role="group" aria-label={'Predict '+symbol+' direction'}>
            <button type="button" aria-pressed={direction==='UP'} className={direction==='UP'?'active up':''}
              onClick={()=>setDirection('UP')}><ArrowUpRight size={16}/> Higher</button>
            <button type="button" aria-pressed={direction==='DOWN'} className={direction==='DOWN'?'active down':''}
              onClick={()=>setDirection('DOWN')}><ArrowDownLeft size={16}/> Lower</button>
          </div>
          <button type="button" className="execute-button buy" disabled={!quote||quote.stale||pending}
            onClick={()=>submit(symbol,direction)}><Target size={15}/>{pending?'Submitting…':'Lock prediction'}</button>
          {quote?.stale && <small className="stock-prediction-note">Quote outdated. Try again when refreshed.</small>}
        </div>}
  </section>;
}
