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

/** Sessions done this week before `date` (or up to it, `withToday`), with the day each was done: a moved session counts where it was done. */
export function doneThisWeek(date: ISODate, data: Data, withToday = false): Map<SessionCode, ISODate> {
  const out = new Map<SessionCode, ISODate>();
  for (let d = startOfWeek(date); withToday ? d <= date : d < date; d = addDays(d, 1)) {
    const rec = data.days.get(d);
    const code = done(rec) ? (rec?.sessionCode ?? scheduledCode(d, data)) : null;
    if (code && !out.has(code)) out.set(code, d);
  }
  return out;
}

/** Heavy sessions planned earlier this week that were not done on any day. */
function missedHeavy(date: ISODate, data: Data, planStart: ISODate, doneCodes: Map<SessionCode, ISODate>): { code: SessionCode; on: ISODate }[] {
  const weekStart = startOfWeek(date);
  const pauses = pausesOf(data.plan);
  const missed: { code: SessionCode; on: ISODate }[] = [];
  for (let i = 0; i < weekday(date); i++) {
    const d = addDays(weekStart, i);
    if (d < planStart || isPausedOn(d, pauses)) continue;
    const code = scheduledCode(d, data);
    if (code && HEAVY_SESSIONS.includes(code) && !done(data.days.get(d)) && !doneCodes.has(code) && !missed.some((m) => m.code === code)) missed.push({ code, on: d });
  }
  return missed;
}

/**
 * Lays the queued sessions over the days left this week: never two leg days in a row, never more than
 * 6 lifting days in 7. When there are more sessions than days, the lowest priority ones go first, never
 * those in `keep`. A day left free takes back a `spare` session (owed this week, dropped earlier), the most
 * valuable first. `first`, when given, is fixed on the first day.
 */
function arrange(data: Data, days: ISODate[], queued: SessionCode[], keep: SessionCode[], spare: SessionCode[], first?: SessionCode | null): { map: Record<ISODate, SessionCode | null>; left: SessionCode[] } {
  const open = first === undefined ? days : days.slice(1);
  let queue = [...queued];
  const dropped: SessionCode[] = [];
  while (queue.length > open.length) {
    const victim = DROP_ORDER.find((c) => queue.includes(c) && !keep.includes(c)) ?? queue[queue.length - 1];
    queue = queue.filter((c, i) => !(c === victim && i === queue.lastIndexOf(victim)));
    dropped.push(victim);
  }

  const map: Record<ISODate, SessionCode | null> = {};
  if (first !== undefined) map[days[0]] = first;
  const history = (d: ISODate): SessionCode | null => {
    if (d in map) return map[d];
    const rec = data.days.get(d);
    return done(rec) ? (rec?.sessionCode ?? scheduledCode(d, data)) : null;
  };
  for (const d of open) {
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
  for (const d of open) {
    if (map[d] !== null || [1, 2, 3, 4, 5, 6].filter((i) => history(addDays(d, -i))).length >= 6) continue;
    const next = map[addDays(d, 1)];
    const back = [...spare].sort((a, b) => DROP_ORDER.indexOf(b) - DROP_ORDER.indexOf(a))
      .find((c) => !Object.values(map).includes(c) && !(isLower(c) && (isLower(history(addDays(d, -1))) || isLower(next))));
    if (back) map[d] = back;
  }
  const left = [...queue, ...dropped].filter((c) => !Object.values(map).includes(c));
  return { map, left };
}

/**
 * Missed heavy day (5.3): if Monday, Tuesday or Thursday's session was not done on any day this week
 * (missed or a Recovery day), offer it in place of today's session. The rest of the week slides; never
 * two leg days in a row, never more than 6 lifting days in 7, Sunday stays a rest day.
 */
export function missedDayOffer(date: ISODate, data: Data, todayType: SessionType | null, planStart: ISODate): SwapOffer | null {
  if (todayType !== 'Full' && todayType !== 'Moderate') return null;
  const wd = weekday(date);
  if (wd > 5) return null;
  const weekStart = startOfWeek(date);
  const doneCodes = doneThisWeek(date, data);
  const missed = missedHeavy(date, data, planStart, doneCodes);
  if (!missed.length) return null;

  const days: ISODate[] = [];
  for (let i = wd; i <= 5; i++) days.push(addDays(weekStart, i));
  const planned = days.map((d) => scheduledCode(d, data)).filter((c): c is SessionCode => !!c && !doneCodes.has(c));
  const queue: SessionCode[] = [...missed.map((m) => m.code), ...planned.filter((c) => !missed.some((m) => m.code === c))];
  const spare = weekSessions(date, data, planStart).filter((c) => !doneCodes.has(c) && !queue.includes(c));
  const { map, left } = arrange(data, days, queue, missed.map((m) => m.code), spare);
  if (map[date] === scheduledCode(date, data)) return null;

  const first = missed[0];
  const lines: string[] = [];
  for (const d of days.slice(1)) {
    const was = scheduledCode(d, data);
    if (map[d] !== was) lines.push(`${weekdayName(d)}: ${map[d] ?? 'rest'}`);
  }
  if (left.length) lines.push(`Skipped this week: ${[...new Set(left)].join(', ')}`);
  return { id: `swap:${date}:${first.code}`, weekStart, missed: first.code, missedOn: first.on, map, lines };
}

/** One way to do today: that session (or rest), and how the rest of the week falls in behind it. */
export interface WeekChoice {
  code: SessionCode | null;
  /** The whole week from Monday, ready to save as a swap: days already gone keep what they had. */
  map: Record<ISODate, SessionCode | null>;
  /** The days after today, in order. */
  rest: { date: ISODate; code: SessionCode | null }[];
  /** Sessions of this week that no longer fit. */
  skipped: SessionCode[];
  warning: string | null;
}

/** The sessions of this week, from the plan as written, on days the plan is running. */
function weekSessions(date: ISODate, data: Data, planStart: ISODate): SessionCode[] {
  const weekStart = startOfWeek(date);
  const pauses = pausesOf(data.plan);
  const out: SessionCode[] = [];
  for (let i = 0; i <= 5; i++) {
    const d = addDays(weekStart, i);
    const code = WEEKDAY_SESSIONS[i];
    if (code && d >= planStart && !isPausedOn(d, pauses)) out.push(code);
  }
  return out;
}

/** Today as `first` (a session, or null for rest), the rest of the week arranged by the same rules as the missed-day offer. */
export function weekWith(date: ISODate, data: Data, first: SessionCode | null, planStart: ISODate): WeekChoice | null {
  const wd = weekday(date);
  if (wd > 5) return null;
  const weekStart = startOfWeek(date);
  const doneCodes = doneThisWeek(date, data);
  const missed = missedHeavy(date, data, planStart, doneCodes).filter((m) => m.code !== first);
  const days: ISODate[] = [];
  for (let i = wd; i <= 5; i++) days.push(addDays(weekStart, i));
  const planned = days.map((d) => scheduledCode(d, data)).filter((c): c is SessionCode => !!c && !doneCodes.has(c) && c !== first && !missed.some((m) => m.code === c));
  const queue = [...missed.map((m) => m.code), ...planned];
  const spare = weekSessions(date, data, planStart).filter((c) => !doneCodes.has(c) && c !== first && !queue.includes(c));
  const { map } = arrange(data, days, queue, missed.map((m) => m.code), spare, first);

  const full: Record<ISODate, SessionCode | null> = {};
  for (let d = weekStart; d < date; d = addDays(d, 1)) full[d] = scheduledCode(d, data);
  Object.assign(full, map);
  const placed = new Set(Object.values(map));
  const skipped = weekSessions(date, data, planStart).filter((c) => !doneCodes.has(c) && !placed.has(c));

  const yesterday = data.days.get(addDays(date, -1));
  const prev = done(yesterday) ? (yesterday?.sessionCode ?? scheduledCode(addDays(date, -1), data)) : null;
  const lifted = [1, 2, 3, 4, 5, 6].filter((i) => done(data.days.get(addDays(date, -i)))).length;
  let warning: string | null = null;
  if (first && lifted >= 6) warning = 'Seventh lifting day in a row: a rest day is wiser.';
  else if (first && isLower(first) && isLower(prev)) warning = `Legs again: ${prev} was yesterday.`;
  return { code: first, map: full, rest: days.slice(1).map((d) => ({ date: d, code: map[d] ?? null })), skipped, warning };
}

/** Every session still owed this week, as a choice for today, plus rest. Sessions done this week are not offered again. */
export function todayChoices(date: ISODate, data: Data, planStart: ISODate): { choices: WeekChoice[]; done: Map<SessionCode, ISODate> } {
  const doneCodes = doneThisWeek(date, data);
  const owed = weekSessions(date, data, planStart).filter((c) => !doneCodes.has(c));
  const today = scheduledCode(date, data);
  const order = [...(today && owed.includes(today) ? [today] : []), ...owed.filter((c) => c !== today)];
  const choices = [...order, null].map((c) => weekWith(date, data, c, planStart)).filter((c): c is WeekChoice => !!c);
  return { choices, done: doneCodes };
}

/** The data as it would be with this choice saved, for previews. */
export function withChoice(data: Data, date: ISODate, choice: WeekChoice): Data {
  return { ...data, plan: [...data.plan, { id: 'preview', kind: 'swap', date, weekStart: startOfWeek(date), map: choice.map, reason: 'preview', updatedAt: Number.MAX_SAFE_INTEGER }] };
}

/** Sessions of this week neither done nor still on the schedule. */
export function skippedThisWeek(date: ISODate, data: Data, planStart: ISODate): SessionCode[] {
  const doneCodes = doneThisWeek(date, data, true);
  const ahead = new Set<SessionCode | null>();
  for (let d = date; d <= addDays(startOfWeek(date), 5); d = addDays(d, 1)) if (!done(data.days.get(d))) ahead.add(scheduledCode(d, data));
  return weekSessions(date, data, planStart).filter((c) => !doneCodes.has(c) && !ahead.has(c));
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
