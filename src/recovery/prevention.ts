// Injury prevention: warm-up ramps, load-spike prompts and injury patterns. Each reports to the Goal
// Guardian as plain prompts. Never an injury prediction: the evidence on workload ratios (ACWR) is
// contested (Impellizzeri FM et al., IJSPP 2020;15:907; Lolli L et al., BJSM 2019;53:921), so the app
// shows no risk zones, only "this jumped, take a look".
import { LIFTS } from '../plan';
import { addDays, diffDays, startOfWeek } from '../engine/dates';
import type { Data } from '../engine/model';
import { live } from '../engine/model';
import { getPosition } from '../engine/position';
import { scheduledCode } from '../engine/schedule';
import { buildSession, modsForType, type PlannedExercise } from '../engine/session';
import type { Units } from '../engine/units';
import type { Equipment } from '../plan/exercises';
import type { ISODate } from '../plan/types';
import { REGION_LABEL, type Injury, type RecordOf, type Region, type WarmupSet } from './model';
import { eventsFor, injuryName } from './state';
import { addSession, performedSets, type MuscleCount } from './volume';

// ---------------------------------------------------------------- warm-up ramps

/**
 * A warm-up ramp toward the working weight: empty bar, then about 40, 60 and 80% for fewer reps each.
 * HEURISTIC: common strength-coaching practice, not a validated protocol. Only for loads of 40 kg or more.
 */
export const WARMUP = { minKg: 40, steps: [[0.4, 5], [0.6, 3], [0.8, 2]] as const, bigJump: 0.7, source: 'Coaching heuristic', evidence: 'heuristic' } as const;

export function suggestRamp(workKg: number, eq: Equipment, u: Units, added = false): WarmupSet[] {
  if (added) return [{ kg: 0, reps: 5 }, { kg: u.roundDown(workKg * 0.5, eq), reps: 3 }];
  if (workKg < WARMUP.minKg) return [];
  const out: WarmupSet[] = [];
  if (eq === 'barbell') out.push({ kg: 20, reps: 10 });
  for (const [pct, reps] of WARMUP.steps) {
    const kg = u.roundDown(workKg * pct, eq);
    if (kg > (out.at(-1)?.kg ?? 0) && kg < workKg) out.push({ kg, reps });
  }
  return out;
}

export const warmupId = (date: ISODate, exercise: string) => `wu:${date}:${exercise}`;
export const warmupFor = (date: ISODate, exercise: string, data: Data) =>
  (data.recovery?.records ?? []).find((r): r is RecordOf<'warmup'> => r.kind === 'warmup' && r.id === warmupId(date, exercise));

/** How the ramp went, for the warning on the Train card. */
export function rampCheck(w: RecordOf<'warmup'> | undefined, workKg: number, started: boolean): { tone: 'moss' | 'gold'; text: string } | null {
  const done = (w?.sets ?? []).filter((s) => s.done);
  if (!started) return null;
  if (!done.length) return { tone: 'gold', text: 'Straight to the working weight: ramp up next time, the heavier the lift the more it matters.' };
  const top = Math.max(...done.map((s) => s.kg));
  if (top < workKg * WARMUP.bigJump) return { tone: 'gold', text: `Big jump: last warm-up ${Math.round((top / workKg) * 100)}% of the working weight. Add a set near 80% next time.` };
  return { tone: 'moss', text: 'Ramp done.' };
}

// ---------------------------------------------------------------- what was actually done

const sessionMemo = new WeakMap<Data, Map<ISODate, PlannedExercise[]>>();

/** The rows served on a past day (rebuilt from the stored day type; never calls computeDay). */
export function servedOn(date: ISODate, data: Data): PlannedExercise[] {
  let m = sessionMemo.get(data);
  if (!m) sessionMemo.set(data, (m = new Map()));
  const hit = m.get(date);
  if (hit) return hit;
  const pos = getPosition(date, data.plan);
  const day = data.days.get(date);
  const code = pos.status === 'active' ? (day?.sessionCode ?? scheduledCode(date, data)) : null;
  const rows = code ? buildSession({ date, code, pos, mods: modsForType(day?.travelMode ? 'Travel' : (day?.readiness?.type ?? 'Full')), data }).exercises : [];
  m.set(date, rows);
  return rows;
}

/** Sets done per muscle in the week starting on a Monday. */
export function doneWeek(monday: ISODate, data: Data): MuscleCount {
  const count: MuscleCount = {};
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    const day = data.days.get(d);
    if (!day?.sessionDone && !day?.session) continue;
    addSession(count, servedOn(d, data), (e) => performedSets(day, e));
  }
  return count;
}

// ---------------------------------------------------------------- load spikes

/** HEURISTIC prompts: +50% and 6 or more sets on a muscle week to week; a lift 10% over its 4-week best (5% in the 4 weeks after a clearance). */
export const SPIKE = { setsPct: 0.5, setsMin: 6, liftPct: 0.1, liftPctAfterClear: 0.05, clearDays: 28, source: 'Coaching heuristic; ACWR is contested (Impellizzeri 2020)', evidence: 'heuristic' } as const;

export interface Spike {
  what: string;
  text: string;
}

function recentlyCleared(date: ISODate, data: Data): boolean {
  return (data.recovery?.injuries ?? []).some((i) => eventsFor(i.id, data, date).some((e) => (e.event === 'cleared' || e.status === 'cleared') && diffDays(date, e.date) <= SPIKE.clearDays));
}

export function loadSpikes(date: ISODate, data: Data): Spike[] {
  const out: Spike[] = [];
  const thisMon = startOfWeek(date);
  const last = doneWeek(addDays(thisMon, -7), data);
  const before = doneWeek(addDays(thisMon, -14), data);
  const prevPos = getPosition(addDays(thisMon, -14), data.plan);
  const easyBefore = prevPos.status !== 'active' || prevPos.weekType.reload;
  for (const [m, c] of Object.entries(last)) {
    const b = before[m as keyof MuscleCount]?.sets ?? 0;
    if (!c || !b) continue;
    if (c.sets - b >= SPIKE.setsMin && c.sets >= b * (1 + SPIKE.setsPct)) {
      out.push({ what: m, text: `${m}: ${b} to ${c.sets} sets week to week${easyBefore ? ' (after a reload or pause week, so partly planned)' : ''}.` });
    }
  }
  const limit = recentlyCleared(date, data) ? SPIKE.liftPctAfterClear : SPIKE.liftPct;
  const weights = live(data.weights).filter((w) => !w.assumed);
  for (const [key, l] of Object.entries(LIFTS)) {
    const mine = weights.filter((w) => w.lift === key || w.exercise === l.name);
    const now = mine.filter((w) => w.date >= addDays(thisMon, -7) && w.date <= date);
    const prior = mine.filter((w) => w.date < addDays(thisMon, -7) && w.date >= addDays(thisMon, -35));
    if (!now.length || !prior.length) continue;
    const top = Math.max(...now.map((w) => w.kg));
    const best = Math.max(...prior.map((w) => w.kg));
    if (best > 0 && top > best * (1 + limit)) out.push({ what: l.short, text: `${l.short}: ${Math.round((top / best - 1) * 100)}% above the best of the previous 4 weeks${limit === SPIKE.liftPctAfterClear ? ' (recently cleared injury: go gently)' : ''}.` });
  }
  return out;
}

/** Warm-ups on heavy days this week, once the owner has started logging them. */
export function warmupLine(date: ISODate, data: Data): string | null {
  const rows = (data.recovery?.records ?? []).filter((r): r is RecordOf<'warmup'> => r.kind === 'warmup');
  if (!rows.length) return null;
  const mon = startOfWeek(date);
  let heavy = 0;
  let ramped = 0;
  for (let d = mon; d <= date; d = addDays(d, 1)) {
    if (!data.days.get(d)?.sessionDone) continue;
    const mains = servedOn(d, data).filter((e) => e.role === 'main' && (e.load?.kg ?? 0) >= WARMUP.minKg);
    if (!mains.length) continue;
    heavy += 1;
    if (mains.some((e) => (warmupFor(d, e.name, data)?.sets ?? []).filter((s) => s.done).length >= 2)) ramped += 1;
  }
  return heavy && ramped < heavy ? `Warm-up ramp logged on ${ramped} of ${heavy} heavy days this week.` : null;
}

/** Prevention prompts for the Goal Guardian. */
export function preventionLines(date: ISODate, data: Data): string[] {
  const out = loadSpikes(date, data).map((s) => `Load jump: ${s.text} A prompt to review, not a prediction.`);
  const w = warmupLine(date, data);
  if (w) out.push(w);
  return out;
}

// ---------------------------------------------------------------- injury patterns

export interface Before {
  injury: Injury;
  sleep: number | null;
  stress: number | null;
  readiness: number | null;
  loadPct: number | null;
  warmup: 'logged' | 'not logged' | 'unknown';
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** The 7 days before each injury: sleep, stress, readiness, load against the 4 weeks before, the warm-up that day. */
export function beforeInjury(i: Injury, data: Data): Before {
  const days = [1, 2, 3, 4, 5, 6, 7].map((k) => data.days.get(addDays(i.start, -k)));
  const sleep = mean(days.map((d) => d?.checkin?.sleepMin).filter((x): x is number => x != null));
  const stress = mean(days.map((d) => d?.checkin?.stress).filter((x): x is number => x != null));
  const readiness = mean(days.map((d) => d?.readiness?.score).filter((x): x is number => x != null));
  const sets = (from: ISODate, n: number) => {
    let s = 0;
    for (let k = 0; k < n; k++) {
      const d = addDays(from, k);
      const day = data.days.get(d);
      if (day?.sessionDone || day?.session) for (const e of servedOn(d, data)) s += performedSets(day, e);
    }
    return s;
  };
  const week = sets(addDays(i.start, -7), 7);
  const month = sets(addDays(i.start, -35), 28) / 4;
  const ex = i.mechanism?.exercise;
  const warm = ex ? (warmupFor(i.start, ex, data)?.sets ?? []).some((s) => s.done) : null;
  return {
    injury: i, sleep, stress, readiness,
    loadPct: month > 0 ? Math.round(((week - month) / month) * 100) : null,
    warmup: warm == null ? 'unknown' : warm ? 'logged' : 'not logged',
  };
}

export interface Patterns {
  recurring: { region: Region; label: string; count: number }[];
  before: Before[];
}

/** Recurring regions and what preceded each injury. Patterns, never conclusions. */
export function patterns(data: Data): Patterns {
  const all = (data.recovery?.injuries ?? []).filter((i) => i.kind !== 'longTerm');
  const counts = new Map<Region, number>();
  for (const i of [...all, ...(data.recovery?.injuries ?? []).filter((x) => x.kind === 'longTerm')]) counts.set(i.region, (counts.get(i.region) ?? 0) + 1);
  return {
    recurring: [...counts].filter(([, n]) => n >= 2).map(([region, count]) => ({ region, label: REGION_LABEL[region], count })),
    before: all.sort((a, b) => (a.start < b.start ? 1 : -1)).map((i) => beforeInjury(i, data)),
  };
}

export const beforeText = (b: Before) => {
  const parts: string[] = [];
  if (b.sleep != null) parts.push(`sleep ${Math.floor(b.sleep / 60)} h ${String(Math.round(b.sleep % 60)).padStart(2, '0')}`);
  if (b.stress != null) parts.push(`stress ${b.stress.toFixed(1)}/5`);
  if (b.readiness != null) parts.push(`readiness ${Math.round(b.readiness)}`);
  if (b.loadPct != null) parts.push(`load ${b.loadPct >= 0 ? '+' : ''}${b.loadPct}% vs the 4 weeks before`);
  if (b.warmup !== 'unknown') parts.push(`warm-up ${b.warmup}`);
  return `${injuryName(b.injury)}: ${parts.length ? parts.join(', ') : 'no data from the week before'}.`;
};
