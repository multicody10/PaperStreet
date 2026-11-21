import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { easternMarketClock, marketSessionOn, nextMarketOpening } from '../shared/marketCalendar';

type Props = { marketOpen: boolean | null };
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const longDay = (date: string) => new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric',
}).format(new Date(date + 'T12:00:00Z'));
const monthName = (year: number, month: number) => new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC', month: 'long', year: 'numeric',
}).format(new Date(Date.UTC(year, month, 1)));

export function MarketSchedule({marketOpen}: Props) {
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visible, setVisible] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [offset, setOffset] = useState(0);
  const [position, setPosition] = useState({top: 66, left: 8});

  const cancelClose = () => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const show = () => {
    cancelClose();
    if (!visible) {
      setNow(new Date());
      setOffset(0);
    }
    setVisible(true);
  };
  const hideSoon = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      if (document.activeElement !== trigger.current && !panel.current?.contains(document.activeElement))
        setVisible(false);
    }, 150);
  };
  const close = () => {
    cancelClose();
    setVisible(false);
    trigger.current?.blur();
  };
  const place = useCallback(() => {
    if (!trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const width = Math.min(340, window.innerWidth - 16);
    setPosition({top: rect.bottom + 8, left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))});
  }, []);
  useEffect(() => {
    if (!visible) return;
    place();
    const sync = () => place();
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true);
    const refresh = setInterval(() => setNow(new Date()), 60000);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
      clearInterval(refresh);
    };
  }, [visible, place]);
  useEffect(() => () => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
  }, []);

  const today = easternMarketClock(now).date;
  const [year, month] = today.split('-').map(Number);
  const view = new Date(Date.UTC(year, month - 1 + offset, 1));
  const viewYear = view.getUTCFullYear();
  const viewMonth = view.getUTCMonth();
  const firstWeekday = new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay();
  const days = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
  const next = nextMarketOpening(now);

  return <>
    <button ref={trigger} type="button"
      className={'header-market-status market-schedule-trigger ' + (marketOpen ? 'open' : 'closed')}
      aria-label={(marketOpen === null ? 'Quotes pending' : marketOpen ? 'Markets Open' : 'Markets Closed') + '. View exchange trading calendar.'}
      aria-haspopup="dialog" aria-expanded={visible} aria-controls={visible ? 'market-hours-popover' : undefined}
      onMouseEnter={show} onMouseLeave={hideSoon} onFocus={show} onBlur={hideSoon}
      onClick={show} onKeyDown={e => {if (e.key === 'Escape') close();}}>
      <span className="status-dot" aria-hidden="true"/>
      <span>{marketOpen === null ? 'Quotes pending' : marketOpen ? 'Markets Open' : 'Markets Closed'}</span>
      <CalendarDays size={13} aria-hidden="true"/>
    </button>
    {visible && createPortal(
      <section id="market-hours-popover" className="market-hours-popover" role="dialog"
        aria-label="US stock exchange trading calendar" ref={panel}
        style={{top: position.top, left: position.left}}
        onMouseEnter={cancelClose} onMouseLeave={hideSoon}
        onFocusCapture={cancelClose} onBlurCapture={hideSoon}
        onKeyDown={e => {if (e.key === 'Escape') close();}}>
        <div className="market-hours-heading">
          <span><CalendarDays size={16}/> Market hours</span>
          <button type="button" onClick={close} aria-label="Close trading calendar"><X size={16}/></button>
        </div>
        <p className="market-hours-description">US stocks (NYSE / Nasdaq)</p>
        <div className="market-hours-next">
          <span>Next market open</span>
          <strong>{longDay(next)} · 9:30 AM ET</strong>
        </div>
        <div className="market-hours-month">
          <button type="button" aria-label="Previous month" onClick={() => setOffset(n => n - 1)}>
            <ChevronLeft size={16}/>
          </button>
          <strong>{monthName(viewYear, viewMonth)}</strong>
          <button type="button" aria-label="Next month" onClick={() => setOffset(n => n + 1)}>
            <ChevronRight size={16}/>
          </button>
        </div>
        <div className="market-hours-grid" aria-label={'Trading days in ' + monthName(viewYear, viewMonth)}>
          {WEEKDAYS.map(day => <span key={day} className="market-hours-weekday">{day}</span>)}
          {Array.from({length: firstWeekday}, (_, index) =>
            <span key={'blank-' + index} className="market-hours-blank"/>)}
          {Array.from({length: days}, (_, index) => {
            const date = [viewYear, String(viewMonth + 1).padStart(2, '0'), String(index + 1).padStart(2, '0')].join('-');
            const session = marketSessionOn(date);
            return <span key={date}
              className={'market-hours-date ' + session.kind + (date === today ? ' today' : '') + (date === next ? ' next' : '')}
              aria-label={longDay(date) + ': ' + (session.kind === 'closed' ? 'Closed, ' : '') + session.reason}
              title={longDay(date) + ': ' + session.reason}>
              {index + 1}
            </span>;
          })}
        </div>
        <div className="market-hours-legend" aria-label="Calendar legend">
          <span><i className="regular"/> Open</span>
          <span><i className="closed"/> Closed</span>
          <span><i className="early"/> Early close</span>
        </div>
        <p className="market-hours-explain">
          <strong>Mon–Fri · 9:30 AM–4:00 PM ET.</strong> Closed on weekends and market holidays.
          Early close days end at 1:00 PM ET. All times follow New York daylight saving time.
        </p>
        <a className="market-hours-source" href="https://www.nyse.com/trade/hours-calendars"
          target="_blank" rel="noopener noreferrer">Official NYSE trading calendar</a>
      </section>, document.body)}
  </>;
}
