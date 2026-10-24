import type { ISODate } from '../plan/types';
import { addDays, lastDays } from './dates';
import type { Data } from './model';

/** Days before today with no steps entered, oldest first: the last `days` days, never before the app was first used. */
export function stepsMissing(today: ISODate, data: Data, days = 7): ISODate[] {
  let first: ISODate | undefined;
  for (const d of data.days.values()) if (!d.deleted && (!first || d.id < first)) first = d.id;
  if (!first) return [];
  const start = first;
  return lastDays(addDays(today, -1), days).filter((d) => {
    const rec = data.days.get(d);
    return d >= start && (!rec || rec.deleted || rec.steps == null);
  });
}

/** A route segment that names a day already gone, or null. */
export function pastDay(segment: string | undefined, today: ISODate): ISODate | null {
  return segment && /^\d{4}-\d{2}-\d{2}$/.test(segment) && segment < today ? segment : null;
}
