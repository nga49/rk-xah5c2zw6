import { HEAVY_SESSIONS, LOWER_BODY_SESSIONS, WEEKDAY_SESSIONS, ZONE2_MIN } from '../plan';
import type { ISODate, SessionCode } from '../plan/types';
import { addDays, startOfWeek, weekday, weekdayName } from './dates';
import type { Data, DayRecord, PlanEvent, SessionType } from './model';
import { live } from './model';
import { isPausedOn, pausesOf } from './position';
import type { CardioRx } from './session';

type SwapEvent = Extract<PlanEvent, { kind: 'swap' }>;

export function swapFor(weekStart: ISODate, data: Data): SwapEvent | undefined {
  const swaps = data.plan.filter((e): e is SwapEvent => e.kind === 'swap' && !e.deleted && e.weekStart === weekStart);
  return swaps.sort((a, b) => a.updatedAt - b.updatedAt).at(-1);
}

/** The session planned for a date, after any accepted swap. */
export function scheduledCode(date: ISODate, data: Data): SessionCode | null {
  const swap = swapFor(startOfWeek(date), data);
  if (swap && date in swap.map) return swap.map[date];
  return WEEKDAY_SESSIONS[weekday(date)];
}

const isLower = (c: SessionCode | null | undefined) => !!c && LOWER_BODY_SESSIONS.includes(c);
const done = (d: DayRecord | undefined) => !!d?.sessionDone && !d.deleted;

export interface SwapOffer {
  id: string;
  weekStart: ISODate;
  missed: SessionCode;
  missedOn: ISODate;
  map: Record<ISODate, SessionCode | null>;
  lines: string[];
}

/** Lowest priority first when a week has more sessions than days left. */
const DROP_ORDER: SessionCode[] = ['GUARDIAN', 'DRAUPNIR', 'VALHALLA', 'LEVIATHAN', 'BLADES', 'SPARTAN'];

/**
 * Missed heavy day (5.3): if Monday, Tuesday or Thursday's session was not done (missed or a Recovery day),
 * offer it in place of today's session. The rest of the week slides; never two leg days in a row,
 * never more than 6 lifting days in 7, Sunday stays a rest day.
 */
export function missedDayOffer(date: ISODate, data: Data, todayType: SessionType | null, planStart: ISODate): SwapOffer | null {
  if (todayType !== 'Full' && todayType !== 'Moderate') return null;
  const wd = weekday(date);
  if (wd > 5) return null;
  const weekStart = startOfWeek(date);
  const pauses = pausesOf(data.plan);
  const missed: { code: SessionCode; on: ISODate }[] = [];
  for (let i = 0; i < wd; i++) {
    const d = addDays(weekStart, i);
    if (d < planStart || isPausedOn(d, pauses)) continue;
    const code = scheduledCode(d, data);
    if (code && HEAVY_SESSIONS.includes(code) && !done(data.days.get(d))) missed.push({ code, on: d });
  }
  if (!missed.length) return null;

  const days: ISODate[] = [];
  for (let i = wd; i <= 5; i++) days.push(addDays(weekStart, i));
  const planned = days.map((d) => scheduledCode(d, data)).filter((c): c is SessionCode => !!c);
  let queue: SessionCode[] = [...missed.map((m) => m.code), ...planned.filter((c) => !missed.some((m) => m.code === c))];
  const dropped: SessionCode[] = [];
  while (queue.length > days.length) {
    const victim = DROP_ORDER.find((c) => queue.includes(c) && !missed.some((m) => m.code === c)) ?? queue[queue.length - 1];
    queue = queue.filter((c, i) => !(c === victim && i === queue.lastIndexOf(victim)));
    dropped.push(victim);
  }

  const map: Record<ISODate, SessionCode | null> = {};
  const history = (d: ISODate): SessionCode | null => {
    if (d in map) return map[d];
    const rec = data.days.get(d);
    return done(rec) ? (rec?.sessionCode ?? scheduledCode(d, data)) : null;
  };
  for (const d of days) {
    const prev = history(addDays(d, -1));
    const liftingIn6 = [1, 2, 3, 4, 5, 6].filter((i) => history(addDays(d, -i))).length;
    if (liftingIn6 >= 6) { map[d] = null; continue; }
    let pick = queue.findIndex((c) => !(isLower(c) && isLower(prev)));
    if (pick === -1) {
      const alt = dropped.findIndex((c) => !isLower(c));
      if (alt !== -1) { queue.unshift(dropped.splice(alt, 1)[0]); pick = 0; }
    }
    if (pick === -1) { map[d] = null; continue; }
    map[d] = queue.splice(pick, 1)[0];
  }
  if (map[date] === scheduledCode(date, data)) return null;

  const first = missed[0];
  const lines: string[] = [];
  for (const d of days.slice(1)) {
    const was = scheduledCode(d, data);
    if (map[d] !== was) lines.push(`${weekdayName(d)}: ${map[d] ?? 'rest'}`);
  }
  const left = [...queue, ...dropped].filter((c) => !Object.values(map).includes(c));
  if (left.length) lines.push(`Skipped this week: ${[...new Set(left)].join(', ')}`);
  return { id: `swap:${date}:${first.code}`, weekStart, missed: first.code, missedOn: first.on, map, lines };
}

/** 3 or more Light or Recovery days in the last 7 (today included). */
export function easyDaysInLast7(date: ISODate, data: Data, todayType: SessionType | null): number {
  let n = todayType === 'Light' || todayType === 'Recovery' ? 1 : 0;
  for (let i = 1; i < 7; i++) {
    const t = data.days.get(addDays(date, -i))?.readiness?.type;
    if (t === 'Light' || t === 'Recovery') n += 1;
  }
  return n;
}

/** Yesterday's steps under 6,000 (only when they were entered). */
export function walkAfterLunch(date: ISODate, data: Data): boolean {
  const steps = data.days.get(addDays(date, -1))?.steps;
  return steps != null && steps < 6000;
}

export interface CardioBalance {
  planned: number;
  done: number;
  missing: number;
  rx: CardioRx | null;
}

/** From Friday, suggest the week's missing easy minutes for Saturday (after VALHALLA) or a Sunday walk. Never hard cardio. */
export function cardioBalance(date: ISODate, data: Data, year: number, recoveryWednesday: boolean): CardioBalance {
  const wd = weekday(date);
  const weekStart = startOfWeek(date);
  const planned = recoveryWednesday ? 0 : ZONE2_MIN[Math.min(4, year)];
  const doneMin = live(data.cardio).filter((c) => c.date >= weekStart && c.date <= date && c.feel !== 'hard').reduce((s, c) => s + c.minutes, 0);
  const allMin = live(data.cardio).filter((c) => c.date >= weekStart && c.date <= date).reduce((s, c) => s + c.minutes, 0);
  const missing = Math.max(0, planned - allMin);
  let rx: CardioRx | null = null;
  if (missing >= 10 && wd === 5) rx = { id: 'cardio:balance', label: `Easy cardio ${missing} min after VALHALLA`, minutes: missing, kind: 'easy', why: 'Weekly cardio short' };
  if (missing >= 10 && wd === 6) rx = { id: 'cardio:balance', label: `Walk ${missing} min`, minutes: missing, kind: 'walk', why: 'Weekly cardio short' };
  return { planned, done: doneMin, missing, rx };
}

/** End of the current plan week, for an early reload (the rest of this week). */
export function endOfWeek(date: ISODate): ISODate {
  return addDays(startOfWeek(date), 6);
}
