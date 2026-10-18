import type { ISODate } from '../plan/types';
import { addDays } from './dates';
import type { BodyLog } from './model';
import { live } from './model';

const EPS = 1e-9;

/** Estimated 1RM (Epley). */
export const epley = (weight: number, reps: number) => weight * (1 + reps / 30);

/** Load that leaves `rir` reps in reserve for `reps` reps. */
export const loadForTarget = (e1rm: number, reps: number, rir: number) => e1rm / (1 + (reps + rir) / 30);

export const roundDown = (x: number, step = 2.5) => Math.floor(x / step + EPS) * step;
export const roundNearest = (x: number, step: number) => Math.round(x / step) * step;
export const round1 = (x: number) => Math.round(x * 10) / 10;

export const leanMass = (weightKg: number, bodyFatPct: number) => weightKg * (1 - bodyFatPct / 100);

export function ffmi(leanKg: number, heightCm: number) {
  const h = heightCm / 100;
  const raw = leanKg / (h * h);
  return { raw, normalized: raw + 6.1 * (1.8 - h) };
}

/** Mean of weigh-ins in the 7 days ending on `date`. Needs at least 3, otherwise null. */
export function weeklyAverage(body: BodyLog[], date: ISODate, minCount = 3): number | null {
  const from = addDays(date, -6);
  const values = live(body).filter((b) => b.weightKg != null && b.date >= from && b.date <= date).map((b) => b.weightKg as number);
  if (values.length < minCount) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** "2,600" */
export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');

/** 137.5 -> "137.5", 140 -> "140" */
export const fmtKg = (n: number) => (Math.round(n * 100) / 100).toString();
