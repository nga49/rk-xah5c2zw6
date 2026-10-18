import { BLOCKS, LIFTS, PHASE_TONE, ROTATION } from '../plan';
import type { ISODate, LiftKey, Tone } from '../plan/types';
import { addDays, diffDays } from './dates';
import { epley, ffmi, leanMass, weeklyAverage } from './formulas';
import type { Data } from './model';
import { live } from './model';
import { pausesOf, realDateOf } from './position';

export interface Pt {
  x: ISODate;
  y: number;
  /** Extra marks for tooltips (clean or hard, test). */
  tag?: string;
}

/** Plan target weight on a plan date (6.1): build blocks rise over weeks 1-5 and stay flat in the reload week; cuts fall linearly. */
export function targetWeight(planDate: ISODate): number | null {
  const b = BLOCKS.find((x) => planDate >= x.start && planDate <= x.end);
  if (!b) return null;
  const day = diffDays(planDate, b.start);
  const len = b.weeks * 7;
  if (b.phase === 'cut' || b.phase === 'mini') return b.w0 + ((b.w1 - b.w0) * day) / (len - 1);
  if (b.phase === 'build') {
    const rise = 5 * 7;
    return day >= rise ? b.w1 : b.w0 + ((b.w1 - b.w0) * day) / rise;
  }
  return b.w0;
}

/** Target line in real dates (pauses shift it). */
export function targetSeries(from: ISODate, to: ISODate, data: Data, step = 3): Pt[] {
  const pauses = pausesOf(data.plan);
  const out: Pt[] = [];
  for (const b of BLOCKS) {
    for (let p = b.start; p <= b.end; p = addDays(p, step)) {
      const real = realDateOf(p, pauses);
      if (real < from || real > to) continue;
      const y = targetWeight(p);
      if (y != null) out.push({ x: real, y });
    }
  }
  return out;
}

export interface Band {
  x0: ISODate;
  x1: ISODate;
  tone: Tone;
  label: string;
}

export function phaseBands(from: ISODate, to: ISODate, data: Data): Band[] {
  const pauses = pausesOf(data.plan);
  return BLOCKS.map((b) => ({ x0: realDateOf(b.start, pauses), x1: realDateOf(b.end, pauses), tone: PHASE_TONE[b.phase], label: b.code }))
    .filter((b) => b.x1 >= from && b.x0 <= to)
    .map((b) => ({ ...b, x0: b.x0 < from ? from : b.x0, x1: b.x1 > to ? to : b.x1 }));
}

export function weightAverageSeries(from: ISODate, to: ISODate, data: Data): Pt[] {
  const out: Pt[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const avg = weeklyAverage(data.body, d);
    if (avg != null) out.push({ x: d, y: Math.round(avg * 10) / 10 });
  }
  return out;
}

export function bodyFatSeries(data: Data): Pt[] {
  return live(data.body)
    .filter((b) => b.bodyFatPct != null)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((b) => ({ x: b.date, y: b.bodyFatPct as number, tag: b.bfSource }));
}

/** Plan body-fat targets at each block end. */
export function bodyFatTargets(data: Data): Pt[] {
  const pauses = pausesOf(data.plan);
  return BLOCKS.map((b) => ({ x: realDateOf(b.end, pauses), y: b.bf }));
}

/** Lean mass and FFMI on days with both a weight and a body-fat reading. */
export function leanSeries(data: Data): { lean: Pt[]; ffmi: Pt[] } {
  const h = data.profile?.heightCm;
  const lean: Pt[] = [];
  const f: Pt[] = [];
  for (const b of live(data.body).filter((x) => x.bodyFatPct != null).sort((a, c) => (a.date < c.date ? -1 : 1))) {
    const w = b.weightKg ?? live(data.body).find((x) => x.date === b.date && x.weightKg != null)?.weightKg;
    if (w == null) continue;
    const l = leanMass(w, b.bodyFatPct as number);
    lean.push({ x: b.date, y: Math.round(l * 10) / 10 });
    if (h) f.push({ x: b.date, y: Math.round(ffmi(l, h).normalized * 10) / 10 });
  }
  return { lean, ffmi: f };
}

/** e1RM over time for a lift and its variations: tests, benchmarks, and the best logged working set of each session (Epley). */
export function e1rmSeries(lift: LiftKey, data: Data): { tests: Pt[]; sessions: Pt[] } {
  const tests = live(data.maxes)
    .filter((m) => m.lift === lift)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((m) => ({ x: m.date, y: Math.round(m.e1rm * 10) / 10, tag: m.source === 'test' ? 'test' : 'benchmark' }));
  const byDay = new Map<ISODate, number>();
  for (const w of live(data.weights)) {
    if (w.lift !== lift || w.reps == null) continue;
    const bw = LIFTS[lift].bodyweight ? (weeklyAverage(data.body, w.date, 1) ?? 0) : 0;
    const e = epley(w.kg + bw, w.reps);
    byDay.set(w.date, Math.max(byDay.get(w.date) ?? 0, e));
  }
  const sessions = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([x, y]) => ({ x, y: Math.round(y * 10) / 10 }));
  return { tests, sessions };
}

export function exerciseNames(data: Data): string[] {
  return [...new Set(live(data.weights).map((w) => w.exercise))].sort();
}

export function workingWeightSeries(exercise: string, data: Data): Pt[] {
  const byDay = new Map<ISODate, { kg: number; tag?: string; at: number }>();
  for (const w of live(data.weights)) {
    if (w.exercise !== exercise) continue;
    const prev = byDay.get(w.date);
    if (!prev || prev.at < w.updatedAt) byDay.set(w.date, { kg: w.kg, tag: w.mark ?? (w.assumed ? 'assumed' : undefined), at: w.updatedAt });
  }
  return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([x, v]) => ({ x, y: v.kg, tag: v.tag }));
}

export interface PR {
  date: ISODate;
  lift: LiftKey;
  e1rm: number;
  prev: number | null;
  source: string;
}

/** e1RM records per lift, newest first. */
export function personalRecords(data: Data): PR[] {
  const events: { date: ISODate; lift: LiftKey; e1rm: number; source: string }[] = [];
  for (const m of live(data.maxes)) events.push({ date: m.date, lift: m.lift, e1rm: m.e1rm, source: m.source });
  for (const lift of Object.keys(LIFTS) as LiftKey[]) for (const p of e1rmSeries(lift, data).sessions) events.push({ date: p.x, lift, e1rm: p.y, source: 'session' });
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.source === 'benchmark' ? -1 : 1));
  const best = new Map<LiftKey, number>();
  const out: PR[] = [];
  for (const e of events) {
    const prev = best.get(e.lift) ?? null;
    if (prev == null) {
      best.set(e.lift, e.e1rm);
      if (e.source !== 'benchmark') out.push({ ...e, prev: null });
      continue;
    }
    if (e.e1rm > prev + 0.05) {
      best.set(e.lift, e.e1rm);
      out.push({ ...e, prev });
    }
  }
  return out.reverse();
}

export interface StandardValues {
  ohp: number | null;
  pullup3: number | null;
  farmer: number | null;
  benchGain: number | null;
  neck: number | null;
  waistHeight: number | null;
  zone2: number | null;
  dates: Record<string, ISODate>;
}

/** Current value for each standard (6.8). */
export function standardValues(today: ISODate, data: Data): StandardValues {
  const dates: Record<string, ISODate> = {};
  const bestOf = (key: string, rows: { date: ISODate; v: number }[]) => {
    let best: { date: ISODate; v: number } | null = null;
    for (const r of rows) if (r.date <= today && (!best || r.v > best.v)) best = r;
    if (best) dates[key] = best.date;
    return best?.v ?? null;
  };
  const ohpLifts = new Set<LiftKey>([ROTATION.press.years[0]]);
  const ohp = bestOf('ohp', live(data.maxes).filter((m) => ohpLifts.has(m.lift)).map((m) => ({ date: m.date, v: m.e1rm })));
  const pull = bestOf('pullup3', live(data.maxes).filter((m) => m.lift === 'pullup' && m.source === 'test' && m.reps >= 3).map((m) => ({ date: m.date, v: m.weightKg })));
  const std = (k: string) => bestOf(k, live(data.standards).filter((s) => s.standard === k).map((s) => ({ date: s.date, v: s.value })));
  const benchTests = live(data.maxes).filter((m) => m.lift === 'bench' && m.source === 'test').sort((a, b) => (a.date < b.date ? -1 : 1));
  const benchGain = benchTests.length >= 2 ? Math.max(...benchTests.slice(1).map((m) => m.e1rm)) / benchTests[0].e1rm - 1 : null;
  const h = data.profile?.heightCm;
  const waist = live(data.body).filter((b) => b.waistCm != null && b.date <= today).sort((a, b) => (a.date < b.date ? -1 : 1)).at(-1);
  if (waist) dates.waistHeight = waist.date;
  return {
    ohp,
    pullup3: pull,
    farmer: std('farmer'),
    benchGain,
    neck: std('neck'),
    waistHeight: h && waist ? (waist.waistCm as number) / h : null,
    zone2: std('zone2'),
    dates,
  };
}
