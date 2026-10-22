// Synthetic, seeded fixtures for whole-plan tests. Neutral numbers only: nothing here is personal.
import { createHash } from 'node:crypto';
import { addDays, weekday } from '../src/engine/dates';
import type { Data, Feel, HrvStatus, SessionType } from '../src/engine/model';
import { SESSION_TYPES } from '../src/engine/model';
import { realDateOf, pausesOf } from '../src/engine/position';
import { computeDay } from '../src/engine/today';
import { PLAN_END, PLAN_START } from '../src/plan';
import type { ISODate } from '../src/plan/types';
import { checkin, makeData, profile, resetUid, setDay, test3rm, uid } from './helpers';

/** Small deterministic PRNG (mulberry32). */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Morning time the engine sees for a given date. */
export const morning = (d: ISODate) => new Date(`${d}T08:00:00`);
export const evening = (d: ISODate) => new Date(`${d}T19:30:00`);

/** JSON with sorted keys; Maps and Sets as sorted arrays. Stable across runs. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v instanceof Map) return [...v.entries()].sort();
    if (v instanceof Set) return [...v].sort();
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.keys(v).sort().reduce<Record<string, unknown>>((o, k) => {
        o[k] = (v as Record<string, unknown>)[k];
        return o;
      }, {});
    }
    return v;
  });
}

export const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 20);

/** Every day the golden test covers: the day before the plan to the day after its (pause-shifted) end. */
export function planDays(data: Data): ISODate[] {
  const out: ISODate[] = [];
  const end = addDays(realDateOf(PLAN_END, pausesOf(data.plan)), 1);
  for (let d = addDays(PLAN_START, -1); d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export const neutralData = () => {
  resetUid();
  return makeData();
};

export function poundsData(): Data {
  resetUid();
  const d = makeData();
  d.profile = profile({ units: 'lb', dumbbellStepLb: 5 });
  return d;
}

/**
 * About 20 months of a plausible training history, written the way the app writes it:
 * check-ins (some pain, rare radiating), travel runs, a pause, overrides, finished sessions,
 * logged weights (some assumed), feedback, 3RM tests, weigh-ins, an accepted swap and kcal change.
 */
export function historyData(seed = 2029, until: ISODate = '2028-06-30'): Data {
  const r = prng(seed);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  resetUid();
  const data = makeData();
  data.plan.push({ id: uid('pause'), kind: 'pause', date: '2027-03-08', days: 5, updatedAt: 1 });
  data.plan.push({ id: uid('reload'), kind: 'reload', date: '2027-06-14', until: '2027-06-20', updatedAt: 1 });
  data.kcalAdjust.push({ id: uid('kcal'), block: '1.2', offsetKcal: -100, date: '2026-12-07', reason: 'synthetic', updatedAt: 1 });
  let travelLeft = 0;
  let bw = 90;
  for (let d: ISODate = PLAN_START; d <= until; d = addDays(d, 1)) {
    const wd = weekday(d);
    if (travelLeft === 0 && r() < 0.012) travelLeft = 2 + Math.floor(r() * 3);
    if (travelLeft > 0) {
      setDay(data, d, { travelMode: true });
      travelLeft -= 1;
    }
    if (r() < 0.86) {
      checkin(data, d, {
        sleepMin: 340 + Math.floor(r() * 190),
        sleepScore: 48 + Math.floor(r() * 48),
        energy: 2 + Math.floor(r() * 4),
        stress: 1 + Math.floor(r() * 4),
        backPain: r() < 0.06 ? 3 + Math.floor(r() * 4) : 0,
        kneePain: r() < 0.05 ? 3 + Math.floor(r() * 4) : 0,
        radiating: r() < 0.004 ? true : undefined,
        hrvStatus: r() < 0.5 ? pick<HrvStatus>(['balanced', 'unbalanced', 'low']) : undefined,
        restingHr: r() < 0.5 ? 48 + Math.floor(r() * 14) : undefined,
        bodyBattery: r() < 0.4 ? 20 + Math.floor(r() * 80) : undefined,
      });
      if (r() < 0.04) setDay(data, d, { override: pick<SessionType>(SESSION_TYPES) });
    }
    if (wd === 0 || wd === 2 || wd === 4) {
      bw += (r() - 0.55) * 0.4;
      data.body.push({ id: uid('body'), date: d, weightKg: Math.round(bw * 10) / 10, updatedAt: Date.parse(d) });
    }
    const view = computeDay(d, data, evening(d));
    if (view.offer && r() < 0.5) {
      data.plan.push({ id: uid('swap'), kind: 'swap', date: d, weekStart: view.offer.weekStart, map: view.offer.map, reason: `Missed ${view.offer.missed}`, updatedAt: 1 });
    }
    const dec = view.decision;
    if (dec.readiness) setDay(data, d, { readiness: { score: dec.readiness.score, type: dec.type, reasons: [dec.reason], overridden: dec.overridden } });
    if (view.session.code && r() < 0.88) {
      const ticks: Record<string, number> = {};
      for (const ex of view.session.exercises) {
        if (ex.role === 'test') continue;
        ticks[ex.key] = r() < 0.9 ? ex.sets : Math.max(0, ex.sets - 1);
        if (ex.load) {
          // Accessories start from a first logged weight, as a real user would enter it.
          const kg = ex.load.kg ?? 10 + Math.floor(r() * 30);
          data.weights.push({
            id: uid('w'), date: d, exercise: ex.name, kg, lift: ex.lift, reps: ex.repsTop ?? undefined, sets: ex.sets,
            mark: r() < 0.7 ? 'clean' : r() < 0.5 ? 'hard' : null, assumed: r() < 0.3, updatedAt: Date.parse(d),
          });
        }
      }
      const lifts: Partial<Record<string, Feel>> = {};
      for (const l of view.session.feedbackLifts) lifts[l] = pick<Feel>(['easy', 'right', 'hard']);
      setDay(data, d, { session: ticks, sessionDone: true, sessionCode: view.session.code, feedback: { rpe: 6 + Math.floor(r() * 4), lifts } });
    }
    for (const t of view.tests) if (t.plannedOn <= d && r() < 0.5) data.maxes.push(test3rm(t.lift, 100 + Math.floor(r() * 60), d));
  }
  return data;
}

/** The fingerprint of every DayView for a fixture, grouped by ISO week (Monday). */
export function weekHashes(data: Data, days = planDays(data), at = morning): Record<string, string> {
  const byWeek = new Map<string, string[]>();
  for (const d of days) {
    const wd = weekday(d);
    const monday = addDays(d, -wd);
    const json = canonical(computeDay(d, data, at(d)));
    const list = byWeek.get(monday) ?? [];
    list.push(json);
    byWeek.set(monday, list);
  }
  const out: Record<string, string> = {};
  for (const [k, v] of byWeek) out[k] = sha(v.join('\n'));
  return out;
}
