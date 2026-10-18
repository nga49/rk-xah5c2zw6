import { BLOCKS, PLAN_END, PLAN_START, ROAD_WEEKS, SEASONS, WEEKDAY_SESSIONS } from '../plan';
import type { Block, ISODate, Season, SessionCode } from '../plan/types';
import { addDays, diffDays, weekday } from './dates';
import type { PlanEvent } from './model';

export interface Pause {
  date: ISODate;
  days: number;
}

export const pausesOf = (plan: PlanEvent[]): Pause[] =>
  plan.filter((e): e is Extract<PlanEvent, { kind: 'pause' }> => e.kind === 'pause' && !e.deleted).map((e) => ({ date: e.date, days: e.days }));

/** How many plan days have been skipped by pauses up to this real date. */
export function shiftFor(date: ISODate, pauses: Pause[]): number {
  return pauses.reduce((sum, p) => sum + Math.min(p.days, Math.max(0, diffDays(date, p.date))), 0);
}

/** "The map slides, it does not break": the plan date that a real date stands on. */
export function planDateOf(date: ISODate, pauses: Pause[]): ISODate {
  return addDays(date, -shiftFor(date, pauses));
}

/** The real date a plan date now falls on. */
export function realDateOf(planDate: ISODate, pauses: Pause[]): ISODate {
  let real = planDate;
  for (const p of [...pauses].sort((a, b) => (a.date < b.date ? -1 : 1))) if (real >= p.date) real = addDays(real, p.days);
  return real;
}

export function isPausedOn(date: ISODate, pauses: Pause[]): boolean {
  return pauses.some((p) => {
    const d = diffDays(date, p.date);
    return d >= 0 && d < p.days;
  });
}

export const totalPausedDays = (pauses: Pause[]) => pauses.reduce((s, p) => s + p.days, 0);

// ---------------------------------------------------------------- week types (5.1)

export interface WeekType {
  n: number;
  name: string;
  /** Display, e.g. "2" or "1-2". */
  rir: string;
  /** Value used in load formulas. */
  rirCalc: number;
  reload: boolean;
  /** 3RM tests are due this week. */
  test: boolean;
  /** Volume W3 and W4: +1 set on trap and delt exercises. */
  extraSets: boolean;
  /** Volume W5: cable and machine isolation may reach 0. */
  isoZero: boolean;
  /** Early reload started by hand. */
  early?: boolean;
}

const wt = (n: number, name: string, rir: string, rirCalc: number, extra: Partial<WeekType> = {}): WeekType => ({
  n,
  name,
  rir,
  rirCalc,
  reload: false,
  test: false,
  extraSets: false,
  isoZero: false,
  ...extra,
});

export function weekTypeFor(block: Block, week: number): WeekType {
  if (block.phase === 'review') {
    if (week === 1) return wt(1, 'Test and measure', '2', 2, { test: true });
    return wt(week, 'Volume', '2', 2);
  }
  if (block.tpl === 'S') {
    switch (week) {
      case 1: return wt(1, 'Settle', '3', 3);
      case 2: return wt(2, 'Build', '2', 2);
      case 3: return wt(3, 'Build', '2', 2);
      case 4: return wt(4, 'Build', '1-2', 2);
      case 5: return wt(5, 'Push', '1', 1);
      default: return wt(6, 'Reload', '3', 3, { reload: true, test: block.test });
    }
  }
  switch (week) {
    case 1: return wt(1, 'Settle', '3', 3);
    case 2: return wt(2, 'Build', '2', 2);
    case 3: return wt(3, '+1 set', '2', 2, { extraSets: true });
    case 4: return wt(4, '+1 set', '1', 1, { extraSets: true });
    case 5: return wt(5, 'Push', '1', 1, { isoZero: true });
    default: return wt(6, 'Reload', '3', 3, { reload: true, test: block.test });
  }
}

// ---------------------------------------------------------------- position (5.1)

export type Status = 'before' | 'active' | 'paused' | 'done';

export interface Position {
  date: ISODate;
  planDate: ISODate;
  status: Status;
  block: Block;
  blockIndex: number;
  week: number;
  weekType: WeekType;
  tpl: 'S' | 'H';
  year: number;
  /** Real dates, after pauses. */
  blockStart: ISODate;
  blockEnd: ISODate;
  /** 0-based plan day within the block. */
  dayInBlock: number;
  season: Season;
  seasonIndex: number;
  seasonDay: number;
  seasonLength: number;
  seasonStart: ISODate;
  seasonEnd: ISODate;
  roadWeek: number;
  /** Planned session for the real weekday (before swaps). */
  session: SessionCode | null;
  pausedDays: number;
}

export function blockIndexAt(planDate: ISODate): number {
  if (planDate < PLAN_START) return 0;
  const i = BLOCKS.findIndex((b) => planDate >= b.start && planDate <= b.end);
  return i === -1 ? BLOCKS.length - 1 : i;
}

export function seasonIndexAt(planDate: ISODate): number {
  if (planDate < PLAN_START) return 0;
  const i = SEASONS.findIndex((s) => planDate >= s.start && planDate <= s.end);
  return i === -1 ? SEASONS.length - 1 : i;
}

export function getPosition(date: ISODate, plan: PlanEvent[] = []): Position {
  const pauses = pausesOf(plan);
  const paused = isPausedOn(date, pauses);
  let planDate = planDateOf(date, pauses);
  let status: Status = paused ? 'paused' : 'active';
  if (planDate < PLAN_START) {
    status = 'before';
    planDate = PLAN_START;
  } else if (planDate > PLAN_END) {
    status = 'done';
  }
  const blockIndex = blockIndexAt(planDate);
  const block = BLOCKS[blockIndex];
  const clampedPlan = planDate > PLAN_END ? PLAN_END : planDate;
  const dayInBlock = diffDays(clampedPlan, block.start);
  const week = Math.min(block.weeks, Math.floor(dayInBlock / 7) + 1);
  let weekType = weekTypeFor(block, week);

  const early = plan.find((e) => e.kind === 'reload' && !e.deleted && date >= e.date && date <= e.until);
  if (early && !weekType.reload) weekType = { ...weekType, name: 'Reload', rir: '3', rirCalc: 3, reload: true, extraSets: false, isoZero: false, early: true };

  const seasonIndex = seasonIndexAt(planDate);
  const season = SEASONS[seasonIndex];
  const seasonLength = diffDays(season.end, season.start) + 1;
  return {
    date,
    planDate,
    status,
    block,
    blockIndex,
    week,
    weekType,
    tpl: block.tpl,
    year: block.year,
    blockStart: realDateOf(block.start, pauses),
    blockEnd: realDateOf(block.end, pauses),
    dayInBlock,
    season,
    seasonIndex,
    seasonDay: Math.min(seasonLength, diffDays(clampedPlan, season.start) + 1),
    seasonLength,
    seasonStart: realDateOf(season.start, pauses),
    seasonEnd: realDateOf(season.end, pauses),
    roadWeek: Math.min(ROAD_WEEKS, Math.floor(diffDays(clampedPlan, PLAN_START) / 7) + 1),
    session: status === 'paused' ? null : WEEKDAY_SESSIONS[weekday(date)],
    pausedDays: totalPausedDays(pauses),
  };
}

/** Real start date of any block, after pauses. */
export function blockRealStart(code: string, plan: PlanEvent[]): ISODate {
  const b = BLOCKS.find((x) => x.code === code);
  if (!b) throw new Error(`Unknown block ${code}`);
  return realDateOf(b.start, pausesOf(plan));
}
