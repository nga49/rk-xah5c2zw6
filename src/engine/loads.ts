import { BLOCKS, LIFTS, ROTATION } from '../plan';
import type { ISODate, LiftKey } from '../plan/types';
import { equipmentFor } from '../plan/exercises';
import { addDays } from './dates';
import { weeklyAverage } from './formulas';
import type { Data, Feel, MaxLog, WorkingWeight } from './model';
import { live } from './model';
import type { Units } from './units';

// ---------------------------------------------------------------- e1RM per lift

export interface Adjustment {
  date: ISODate;
  pct: number;
  reason: string;
}

export interface E1rmInfo {
  lift: LiftKey;
  /** Working e1RM after feedback adjustments. */
  e1rm: number;
  base: number;
  source: 'test' | 'benchmark' | 'derived';
  baseDate?: ISODate;
  derivedFrom?: LiftKey;
  adjustments: Adjustment[];
  /** Benchmarks stay "unverified" until a real test replaces them. */
  unverified: boolean;
}

const byDateThenUpdate = <T extends { date: ISODate; updatedAt: number }>(a: T, b: T) =>
  a.date === b.date ? a.updatedAt - b.updatedAt : a.date < b.date ? -1 : 1;

export function latestMax(maxes: MaxLog[], lift: LiftKey, date: ISODate): MaxLog | null {
  const rows = live(maxes).filter((m) => m.lift === lift && m.date <= date);
  const tests = rows.filter((m) => m.source === 'test').sort(byDateThenUpdate);
  if (tests.length) return tests[tests.length - 1];
  const marks = rows.filter((m) => m.source === 'benchmark').sort(byDateThenUpdate);
  return marks.length ? marks[marks.length - 1] : null;
}

/** The lift a variation starts from (6.5): every variation's previous lift is the year 1 lift of its slot. */
export function previousLift(lift: LiftKey): LiftKey | null {
  const slot = LIFTS[lift].slot;
  if (!slot) return null;
  const base = ROTATION[slot].years[0];
  return base === lift ? null : base;
}

/**
 * Feedback loop (5.3b.2): "easy" at the target RIR twice in a row raises the working e1RM 2.5%,
 * "hard" twice in a row lowers it 2.5%. Only sessions after the base test count, and only days before `date`.
 */
export function feedbackAdjustments(lift: LiftKey, since: ISODate | undefined, date: ISODate, data: Data): Adjustment[] {
  const feels: { date: ISODate; feel: Feel }[] = [];
  for (const day of data.days.values()) {
    const feel = day.feedback?.lifts?.[lift];
    if (!feel || day.deleted || day.id >= date || (since && day.id <= since)) continue;
    feels.push({ date: day.id, feel });
  }
  feels.sort((a, b) => (a.date < b.date ? -1 : 1));
  const out: Adjustment[] = [];
  let easy = 0;
  let hard = 0;
  for (const f of feels) {
    if (f.feel === 'easy') { easy += 1; hard = 0; }
    else if (f.feel === 'hard') { hard += 1; easy = 0; }
    else { easy = 0; hard = 0; }
    if (easy === 2) { out.push({ date: f.date, pct: 2.5, reason: 'two easy sessions' }); easy = 0; }
    if (hard === 2) { out.push({ date: f.date, pct: -2.5, reason: 'two hard sessions' }); hard = 0; }
  }
  return out;
}

export function e1rmFor(lift: LiftKey, date: ISODate, data: Data): E1rmInfo | null {
  const own = latestMax(data.maxes, lift, date);
  let base: number;
  let source: E1rmInfo['source'];
  let baseDate: ISODate | undefined;
  let derivedFrom: LiftKey | undefined;
  if (own) {
    base = own.e1rm;
    source = own.source;
    baseDate = own.date;
  } else {
    const prev = previousLift(lift);
    if (!prev) return null;
    const from = e1rmFor(prev, date, data);
    if (!from) return null;
    base = from.e1rm * 0.9;
    source = 'derived';
    baseDate = from.baseDate;
    derivedFrom = prev;
  }
  const adjustments = feedbackAdjustments(lift, baseDate, date, data);
  const factor = adjustments.reduce((f, a) => f * (1 + a.pct / 100), 1);
  return { lift, e1rm: base * factor, base, source, baseDate, derivedFrom, adjustments, unverified: source !== 'test' };
}

/** +2.5 kg chosen after a clean W5, applied from that block on, until the next test re-bases the lift. */
export function liftOffsetKg(lift: LiftKey, blockIndex: number, baseDate: ISODate | undefined, data: Data): number {
  let kg = 0;
  for (const e of data.plan) {
    if (e.kind !== 'liftOffset' || e.deleted || e.lift !== lift) continue;
    if (baseDate && e.date < baseDate) continue;
    const from = BLOCKS.findIndex((b) => b.code === e.fromBlock);
    if (from !== -1 && from <= blockIndex) kg += e.kg;
  }
  return kg;
}

/** Bodyweight for pull-up loads: the 7-day average, else the latest weigh-in in the last 14 days. */
export function bodyweightOn(date: ISODate, data: Data): number | null {
  const avg = weeklyAverage(data.body, date, 1);
  if (avg != null) return avg;
  const from = addDays(date, -14);
  const recent = live(data.body).filter((b) => b.weightKg != null && b.date >= from && b.date <= date).sort(byDateThenUpdate);
  return recent.length ? (recent[recent.length - 1].weightKg as number) : null;
}

// ---------------------------------------------------------------- accessory progression

export interface Progress {
  kg: number | null;
  badge: 'up' | 'hold' | 'down' | null;
  deltaKg: number;
  reason: string | null;
  lastKg: number | null;
  lastMark: WorkingWeight['mark'];
}

/** One log per session date (the newest edit wins), oldest first. */
export function historyFor(exercise: string, weights: WorkingWeight[], before: ISODate): WorkingWeight[] {
  const byDate = new Map<ISODate, WorkingWeight>();
  for (const w of live(weights)) {
    if (w.exercise !== exercise || w.date >= before) continue;
    const prev = byDate.get(w.date);
    if (!prev || prev.updatedAt < w.updatedAt) byDate.set(w.date, w);
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * Accessories: up one step after 2 clean sessions in a row at the same weight (top of the range),
 * hold after a hard session, 5% down after 2 hard sessions in a row at the same weight.
 */
export function accessoryProgress(exercise: string, weights: WorkingWeight[], before: ISODate, u: Units): Progress {
  const eq = equipmentFor(exercise);
  const logs = historyFor(exercise, weights, before);
  const none: Progress = { kg: null, badge: null, deltaKg: 0, reason: null, lastKg: null, lastMark: null };
  if (!logs.length) return none;
  const last = logs[logs.length - 1];
  const prev = logs.length > 1 ? logs[logs.length - 2] : null;
  const base = { lastKg: last.kg, lastMark: last.mark ?? null };
  const sameWeight = prev && u.same(prev.kg, last.kg);
  if (sameWeight && last.mark === 'clean' && prev.mark === 'clean') {
    const kg = u.nextUp(last.kg, eq);
    return { ...base, kg, badge: 'up', deltaKg: kg - last.kg, reason: '2 clean sessions in a row' };
  }
  if (sameWeight && last.mark === 'hard' && prev.mark === 'hard') {
    const kg = u.dropFive(last.kg, eq);
    return { ...base, kg, badge: 'down', deltaKg: kg - last.kg, reason: '2 hard sessions in a row: 5% lighter' };
  }
  if (last.mark === 'hard') return { ...base, kg: last.kg, badge: 'hold', deltaKg: 0, reason: 'Last session was hard: hold' };
  return { ...base, kg: last.kg, badge: null, deltaKg: 0, reason: null };
}
