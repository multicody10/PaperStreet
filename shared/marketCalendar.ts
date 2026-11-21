export type Session = { kind: 'regular' | 'early' | 'closed'; reason: string; closeMinute: number };
const closed = (reason: string): Session => ({kind: 'closed', reason, closeMinute: 0});
const dayCode = (year: number, month: number, day: number) =>
  [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-');

function nthWeekday(year: number, month: number, weekday: number, nth: number): number {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return 1 + (weekday - first + 7) % 7 + (nth - 1) * 7;
}
function lastWeekday(year: number, month: number, weekday: number): number {
  const last = new Date(Date.UTC(year, month, 0));
  return last.getUTCDate() - (last.getUTCDay() - weekday + 7) % 7;
}
function observed(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  // NYSE does not observe New Year's Day on the previous Friday when Jan 1 is Saturday.
  if (month === 1 && day === 1 && weekday === 6) return null;
  if (weekday === 6) date.setUTCDate(date.getUTCDate() - 1);
  if (weekday === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
function easterSunday(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k + 7 * 6) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = (h + l - 7 * m + 114) % 31 + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

// NYSE core equities calendar, using Eastern date keys (YYYY-MM-DD).
// Keep this shared between the Worker and the Activity's market-status calendar.
export function marketSessionOn(date: string): Session {
  const [year, month, day] = date.split('-').map(Number);
  if (!Number.isSafeInteger(year) || !Number.isSafeInteger(month) || !Number.isSafeInteger(day) ||
      new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== date)
    return closed('Invalid date');
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (weekday === 0 || weekday === 6) return closed('Weekend');
  const goodFriday = easterSunday(year);
  goodFriday.setUTCDate(goodFriday.getUTCDate() - 2);
  const holidays = new Map<string | null, string>([
    [observed(year, 1, 1), "New Year's Day"],
    [observed(year + 1, 1, 1), "New Year's Day"],
    [dayCode(year, 1, nthWeekday(year, 1, 1, 3)), 'Martin Luther King Jr. Day'],
    [dayCode(year, 2, nthWeekday(year, 2, 1, 3)), "Washington's Birthday"],
    [goodFriday.toISOString().slice(0, 10), 'Good Friday'],
    [dayCode(year, 5, lastWeekday(year, 5, 1)), 'Memorial Day'],
    [observed(year, 6, 19), 'Juneteenth'],
    [observed(year, 7, 4), 'Independence Day'],
    [dayCode(year, 9, nthWeekday(year, 9, 1, 1)), 'Labor Day'],
    [dayCode(year, 11, nthWeekday(year, 11, 4, 4)), 'Thanksgiving Day'],
    [observed(year, 12, 25), 'Christmas Day'],
  ]);
  const holiday = holidays.get(date);
  if (holiday) return closed(holiday);
  const thanksgiving = nthWeekday(year, 11, 4, 4);
  const early = (month === 11 && day === thanksgiving + 1) ||
    (month === 7 && day === 3) || (month === 12 && day === 24);
  return early
    ? {kind: 'early', reason: 'Early close at 1:00 PM ET', closeMinute: 13 * 60}
    : {kind: 'regular', reason: '9:30 AM–4:00 PM ET', closeMinute: 16 * 60};
}

const easternClock = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
export function easternMarketClock(now: Date): { date: string; minute: number } {
  const fields = Object.fromEntries(easternClock.formatToParts(now).map(({type, value}) => [type, value]));
  return {date: [fields.year, fields.month, fields.day].join('-'),
    minute: Number(fields.hour) * 60 + Number(fields.minute)};
}
export function nextMarketOpening(now: Date): string {
  const eastern = easternMarketClock(now);
  const start = Date.parse(eastern.date + 'T12:00:00Z');
  for (let offset = 0; offset <= 14; offset++) {
    const date = new Date(start + offset * 86400000).toISOString().slice(0, 10);
    if (marketSessionOn(date).kind !== 'closed' && (offset > 0 || eastern.minute < 570)) return date;
  }
  throw new Error('Unable to find next market opening');
}
