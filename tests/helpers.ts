import { existsSync, readFileSync } from 'node:fs';
import { epley } from '../src/engine/formulas';
import type { Checkin, Data, DayRecord, MaxLog, PlanEvent, Profile, WorkingWeight } from '../src/engine/model';
import { emptyData } from '../src/engine/model';
import type { ISODate, LiftKey } from '../src/plan/types';

let seq = 0;
export const uid = (p = 'id') => `${p}-${++seq}`;

export function profile(over: Partial<Profile> = {}): Profile {
  return {
    id: 'me',
    name: 'Test',
    goal: 'Test goal',
    injuries: '',
    rules: '',
    startDate: '2026-10-19',
    units: 'kg',
    dumbbellStep: 2,
    safetyBar: false,
    beltSquat: false,
    updatedAt: 1,
    ...over,
  };
}

/** Neutral numbers for committed tests. Real numbers live only in the git-ignored private fixture. */
export const NEUTRAL_1RM: Partial<Record<LiftKey, number>> = { bench: 160, squat: 150, ohp: 70, hipthrust: 160, shrug: 130 };

export function makeData(maxes: Partial<Record<LiftKey, number>> = NEUTRAL_1RM): Data {
  const data = emptyData();
  data.profile = profile();
  for (const [lift, e1rm] of Object.entries(maxes)) data.maxes.push(benchmark(lift as LiftKey, e1rm as number));
  return data;
}

export function benchmark(lift: LiftKey, e1rm: number, date: ISODate = '2026-10-18'): MaxLog {
  return { id: uid('max'), date, lift, weightKg: e1rm, reps: 1, e1rm, source: 'benchmark', updatedAt: 1 };
}

export function test3rm(lift: LiftKey, kg: number, date: ISODate, reps = 3): MaxLog {
  return { id: uid('max'), date, lift, weightKg: kg, reps, e1rm: epley(kg, reps), source: 'test', updatedAt: 2 };
}

export const GOOD: Checkin = { sleepMin: 470, sleepScore: 84, energy: 4, stress: 2, backPain: 0, kneePain: 0 };

export function setDay(data: Data, date: ISODate, patch: Partial<DayRecord>): DayRecord {
  const prev = data.days.get(date) ?? { id: date, updatedAt: 0 };
  const next = { ...prev, ...patch, id: date, updatedAt: (prev.updatedAt ?? 0) + 1 };
  data.days.set(date, next);
  return next;
}

export function checkin(data: Data, date: ISODate, c: Partial<Checkin> = {}): DayRecord {
  return setDay(data, date, { checkin: { ...GOOD, ...c } });
}

export function weight(data: Data, date: ISODate, exercise: string, kg: number, mark: WorkingWeight['mark']): WorkingWeight {
  const w: WorkingWeight = { id: uid('w'), date, exercise, kg, mark, updatedAt: Date.parse(date) };
  data.weights.push(w);
  return w;
}

export function pause(data: Data, date: ISODate, days: number): PlanEvent {
  const e: PlanEvent = { id: uid('pause'), kind: 'pause', date, days, updatedAt: 1 };
  data.plan.push(e);
  return e;
}

/** Optional local fixture with the real benchmarks (never committed). */
export function privateFixture(): { bench?: number; expect?: { full: number; moderate: number; light: number } } | null {
  const url = new URL('./private.local.json', import.meta.url);
  if (!existsSync(url)) return null;
  return JSON.parse(readFileSync(url, 'utf8'));
}
