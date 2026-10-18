import type { ISODate } from '../plan/types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Today's local calendar date (the phone's time zone, day boundary at local midnight). */
export function todayISO(now: Date = new Date()): ISODate {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Day arithmetic runs on UTC midnights so daylight saving changes never shift a date.
const toUTC = (d: ISODate) => {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day);
};
const fromUTC = (ms: number): ISODate => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

export const DAY_MS = 86400000;

export function addDays(d: ISODate, n: number): ISODate {
  return fromUTC(toUTC(d) + n * DAY_MS);
}

/** a - b in whole days. */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(a) - toUTC(b)) / DAY_MS);
}

/** 0 = Monday ... 6 = Sunday. */
export function weekday(d: ISODate): number {
  return (new Date(toUTC(d)).getUTCDay() + 6) % 7;
}

export function startOfWeek(d: ISODate): ISODate {
  return addDays(d, -weekday(d));
}

export function dayOfMonth(d: ISODate): number {
  return Number(d.slice(8, 10));
}

export function monthKey(d: ISODate): string {
  return d.slice(0, 7);
}

export function isLastSundayOfMonth(d: ISODate): boolean {
  return weekday(d) === 6 && monthKey(addDays(d, 7)) !== monthKey(d);
}

export function between(d: ISODate, start: ISODate, end: ISODate): boolean {
  return d >= start && d <= end;
}

export function range(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The n days ending on (and including) d, oldest first. */
export function lastDays(d: ISODate, n: number): ISODate[] {
  return range(addDays(d, -(n - 1)), d);
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEKDAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const weekdayName = (d: ISODate) => WEEKDAYS[weekday(d)];
export const weekdayShort = (d: ISODate) => WEEKDAYS_SHORT[weekday(d)];
export const WEEKDAY_NAMES = WEEKDAYS;

/** "Monday 19 October" */
export function formatLong(d: ISODate): string {
  return `${weekdayName(d)} ${dayOfMonth(d)} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
}

/** "19 Oct" */
export function formatShort(d: ISODate): string {
  return `${dayOfMonth(d)} ${MONTHS_SHORT[Number(d.slice(5, 7)) - 1]}`;
}

/** "19 Oct 2026" */
export function formatMedium(d: ISODate): string {
  return `${formatShort(d)} ${d.slice(0, 4)}`;
}

export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  return `${formatShort(todayISO(d))} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 340 -> "5 h 40" */
export function formatSleep(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min - h * 60);
  return m ? `${h} h ${pad(m)}` : `${h} h`;
}
