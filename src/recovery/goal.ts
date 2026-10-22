// Goal Guardian: one service every adaptation reports to. It keeps the North Star in view:
// about 89 kg at about 15% body fat, a strong yoke and real strength, around autumn 2029.
// Honest by construction: ranges, never a fake precise date; "not judged" rather than a guess.
import { BLOCKS, LIFTS } from '../plan';
import { addDays, diffDays, formatMedium, startOfWeek } from '../engine/dates';
import { weeklyAverage } from '../engine/formulas';
import type { Data } from '../engine/model';
import { live } from '../engine/model';
import { getPosition, pausesOf, planDateOf, realDateOf } from '../engine/position';
import { scheduledCode } from '../engine/schedule';
import { buildSessionCore } from '../engine/session';
import { targetWeight } from '../engine/stats';
import { computeDay } from '../engine/today';
import { unitsOf } from '../engine/units';
import type { ISODate, LiftKey } from '../plan/types';
import type { RecordOf } from './model';
import { goalLiftsOf } from './lifts';
import { reassurance } from './mind';
import { goalSignals, type GoalSignals } from './signals';
import { addSession, floorFor, FILL_PRIORITY, FLOOR, GOAL_MUSCLES, originalCounts, performedSets, YOKE, type GoalMuscle, type MuscleCount } from './volume';

export type GoalStatus = 'maintained' | 'slowed' | 'at-risk';
export type PartStatus = GoalStatus | 'not-judged';
export const STATUS_WORD: Record<GoalStatus, string> = { maintained: 'Maintained', slowed: 'Slowed', 'at-risk': 'At risk' };
export const STATUS_TONE: Record<GoalStatus, 'moss' | 'gold' | 'ember'> = { maintained: 'moss', slowed: 'gold', 'at-risk': 'ember' };

/** The block whose end the plan builds to: Sharpen, ending mid-September 2029. Derived, so it cannot drift. */
export const GOAL_BLOCK = '3.8';
const AFTER_GOAL = '3.9';

export interface GoalDef {
  weightKg: [number, number];
  bodyFatPct: [number, number];
  block: string;
  /** The plan reaches the goal between these real dates (pause-shifted). */
  from: ISODate;
  to: ISODate;
  yoke: GoalMuscle[];
  strength: { lift: LiftKey; target: string }[];
  overridden: boolean;
}

export function resolveGoal(data: Data): GoalDef {
  const b = BLOCKS.find((x) => x.code === GOAL_BLOCK) as (typeof BLOCKS)[number];
  const next = BLOCKS.find((x) => x.code === AFTER_GOAL) as (typeof BLOCKS)[number];
  const pauses = pausesOf(data.plan);
  const o = data.recovery?.records.find((r): r is RecordOf<'goal'> => r.kind === 'goal');
  return {
    // About 89 kg: the band spans the Sharpen block's end weight and the peak just before it.
    weightKg: o?.weightKg ?? [b.w1 - 0.5, b.w1 + 1.5],
    bodyFatPct: o?.bodyFatPct ?? [Math.round((b.bf - 1) * 10) / 10, Math.round((b.bf + 0.7) * 10) / 10],
    block: b.code,
    from: realDateOf(b.end, pauses),
    to: realDateOf(next.end, pauses),
    yoke: YOKE,
    strength: [
      { lift: 'ohp', target: '80 kg+' },
      { lift: 'pullup', target: '+40 kg × 3' },
      { lift: 'shrug', target: 'progressing' },
    ],
    overridden: !!o,
  };
}

// ---------------------------------------------------------------- volume

export interface MuscleWeek {
  muscle: GoalMuscle;
  target: number;
  minDays: number;
  original: number;
  originalDays: number;
  /** Done so far plus still planned this week. */
  projected: number;
  performed: number;
  days: number;
  status: 'met' | 'short' | 'paused' | 'untrained';
  pausedWhy?: string;
}

/** This week, per muscle: sets done so far plus what is still planned, against the rule floor. */
export function weekVolume(date: ISODate, data: Data, sig: GoalSignals = goalSignals(date, data)): MuscleWeek[] {
  const monday = startOfWeek(date);
  const original = originalCounts(date, data, buildSessionCore);
  const done: MuscleCount = {};
  const projected: MuscleCount = {};
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    const pos = getPosition(d, data.plan);
    if (pos.status !== 'active' || !scheduledCode(d, data)) continue;
    const day = data.days.get(d);
    const session = computeDay(d, data, new Date(`${d}T08:00:00`)).session;
    const past = d < date || (d === date && !!day?.sessionDone);
    if (past) {
      addSession(done, session.exercises, (e) => performedSets(day, e));
      addSession(projected, session.exercises, (e) => performedSets(day, e));
    } else {
      addSession(projected, session.exercises);
    }
  }
  return GOAL_MUSCLES.map((m) => {
    const o = original[m] ?? { sets: 0, days: 0 };
    const p = projected[m] ?? { sets: 0, days: 0 };
    const target = Math.min(floorFor(m), o.sets);
    const minDays = Math.min(FLOOR.days, o.days);
    const paused = sig.pausedMuscles.get(m);
    const status: MuscleWeek['status'] = paused ? 'paused' : o.sets === 0 ? 'untrained' : p.sets >= target && p.days >= minDays ? 'met' : 'short';
    return { muscle: m, target, minDays, original: o.sets, originalDays: o.days, projected: p.sets, performed: done[m]?.sets ?? 0, days: p.days, status, pausedWhy: paused };
  });
}

// ---------------------------------------------------------------- the verdict

export interface Part {
  status: PartStatus;
  reason: string;
}

export interface GuardianView {
  date: ISODate;
  goal: GoalDef;
  status: GoalStatus;
  reason: string;
  why: string[];
  /** The slowdown comes only from protecting an injured area. */
  protective: boolean;
  parts: { volume: Part; weight: Part; strength: Part; consistency: Part };
  volume: MuscleWeek[];
  kept: string[];
  paused: string[];
  actions: string[];
  range: { label: string; why: string[] };
  tradeoffs: string[];
  prevention: string[];
  /** What a layoff is keeping: girths, weight, protein. */
  reassurance: string[];
}

const rank: Record<PartStatus, number> = { 'not-judged': -1, maintained: 0, slowed: 1, 'at-risk': 2 };

function volumePart(vol: MuscleWeek[], sig: GoalSignals): Part {
  if (sig.suspended) return { status: 'slowed', reason: `Set targets paused: ${sig.suspended}` };
  const priority = vol.filter((v) => FILL_PRIORITY.includes(v.muscle) && v.status !== 'paused' && v.status !== 'untrained');
  const short = priority.filter((v) => v.status === 'short');
  if (!short.length) return { status: 'maintained', reason: 'Every goal muscle gets its sets and days this week.' };
  const gap = (v: MuscleWeek) => (v.target ? (v.target - v.projected) / v.target : 0);
  const yokeBad = short.find((v) => YOKE.includes(v.muscle) && gap(v) > 0.3);
  const worst = [...short].sort((a, b) => gap(b) - gap(a))[0];
  if (yokeBad) return { status: 'at-risk', reason: `${yokeBad.muscle} ${yokeBad.projected} of ${yokeBad.target} sets this week.` };
  const dayShort = worst.days < worst.minDays;
  return { status: 'slowed', reason: `${worst.muscle} ${worst.projected} of ${worst.target} sets${dayShort ? `, ${worst.days} day${worst.days === 1 ? '' : 's'}` : ''} this week.` };
}

function weightPart(date: ISODate, data: Data, goal: GoalDef): Part & { gap?: number } {
  const avg = weeklyAverage(data.body, date);
  if (avg == null) return { status: 'not-judged', reason: 'Need 3 weigh-ins this week to judge weight.' };
  const pauses = pausesOf(data.plan);
  const curve = targetWeight(planDateOf(date, pauses)) ?? BLOCKS[0].w0;
  const gap = avg - curve;
  const u = unitsOf(data.profile);
  const prevAvg = weeklyAverage(data.body, addDays(date, -7));
  const prevCurve = targetWeight(planDateOf(addDays(date, -7), pauses)) ?? curve;
  const prevGap = prevAvg != null ? prevAvg - prevCurve : null;
  const side = gap > 0 ? 'above' : 'below';
  const maint = data.recovery?.records.some((r) => r.kind === 'nutrition' && r.mode === 'maintenance' && r.date <= date) || live(data.kcalAdjust).some((k) => k.sourceId?.startsWith('rec:maint:') && k.date <= date);
  if (Math.abs(gap) <= 1.5) return { status: 'maintained', reason: `Weight ${u.w(avg, 1)}, on the plan curve.`, gap };
  if (Math.abs(gap) <= 3 || prevGap == null || Math.abs(prevGap) <= 3) {
    return { status: 'slowed', reason: `Weight ${u.w(Math.abs(gap), 1)} ${side} the plan curve${maint ? ' (maintenance on purpose)' : ''}.`, gap };
  }
  return { status: 'at-risk', reason: `Weight ${u.w(Math.abs(gap), 1)} ${side} the plan curve two weeks running. Goal band ${u.w(goal.weightKg[0], 1)} to ${u.w(goal.weightKg[1], 1)}.`, gap };
}

/** The main lifts the goal rests on this year. */
export const goalLifts = goalLiftsOf;

function strengthPart(date: ISODate, data: Data, sig: GoalSignals): Part {
  const lifts = goalLifts(date, data).filter((l) => !sig.pausedLifts.has(l));
  const pos = getPosition(date, data.plan);
  const tests = live(data.maxes).filter((m) => m.source === 'test' && m.date <= date);
  for (const l of lifts) {
    const t = tests.filter((m) => m.lift === l).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (t.length >= 2) {
      const [a, b] = t.slice(-2);
      if (b.e1rm < a.e1rm * 0.95) return { status: 'slowed', reason: `${LIFTS[l].short} tested ${Math.round((1 - b.e1rm / a.e1rm) * 100)}% lower than last time.` };
    }
  }
  // Judge "untrained" only after 3 weeks on the plan and with no pause in the last 14 days.
  const since = addDays(date, -14);
  const activeFortnight = [...Array(14).keys()].every((i) => getPosition(addDays(date, -i), data.plan).status === 'active');
  if (pos.status === 'active' && diffDays(date, BLOCKS[0].start) >= 21 && activeFortnight) {
    for (const l of lifts.filter((x) => LIFTS[x].slot && LIFTS[x].slot !== 'squat')) {
      const name = LIFTS[l].name;
      const trained = live(data.weights).some((w) => w.date >= since && w.date <= date && !w.assumed && (w.lift === l || w.exercise === name));
      if (!trained) return { status: 'at-risk', reason: `${LIFTS[l].short} not trained in 14 days.` };
    }
  }
  const paused = [...sig.pausedLifts.keys()].map((l) => LIFTS[l].short);
  if (!tests.length) return { status: 'maintained', reason: paused.length ? `Unaffected lifts trained; ${paused.join(', ')} paused, not lost.` : 'Main lifts trained. No tests yet: benchmarks only.' };
  return { status: 'maintained', reason: paused.length ? `Tested lifts holding; ${paused.join(', ')} paused, not lost.` : 'Tested lifts holding.' };
}

function consistencyPart(date: ISODate, data: Data): Part {
  let planned = 0;
  let done = 0;
  for (let i = 1; i <= 14; i++) {
    const d = addDays(date, -i);
    const pos = getPosition(d, data.plan);
    if (pos.status !== 'active' || !scheduledCode(d, data)) continue;
    planned += 1;
    if (data.days.get(d)?.sessionDone) done += 1;
  }
  if (planned < 3) return { status: 'not-judged', reason: 'Too early to judge consistency.' };
  const r = done / planned;
  const text = `${done} of ${planned} sessions in the last 14 days.`;
  // 80% is the same line the block trophies use.
  if (r >= 0.8) return { status: 'maintained', reason: text };
  if (r >= 0.5) return { status: 'slowed', reason: text };
  return { status: 'at-risk', reason: text };
}

const SEASON_OF = (m: number) => (m <= 1 || m === 12 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn');
function seasonWord(d: ISODate): string {
  const y = Number(d.slice(0, 4));
  const m = Number(d.slice(5, 7));
  const s = SEASON_OF(m);
  const label = s.charAt(0).toUpperCase() + s.slice(1);
  if (s === 'winter') return m === 12 ? `${label} ${y}/${String(y + 1).slice(2)}` : `${label} ${y - 1}/${String(y).slice(2)}`;
  return `${label} ${y}`;
}

/** The goal date as a range in seasons. It never moves earlier than the plan, and widens only with a measured reason. */
export function goalRange(goal: GoalDef, parts: GuardianView['parts'] & { weightGap?: number }, sig: GoalSignals, date: ISODate): GuardianView['range'] {
  const why: string[] = [`Plan: block ${goal.block} ends ${formatMedium(goal.from)}.`];
  let slipWeeks = 0;
  if (parts.weight.status === 'at-risk' && parts.weightGap != null) {
    // About 0.25 kg a week is the plan's typical build slope (blocks.json); capped so one bad month cannot dominate.
    const w = Math.min(12, Math.ceil(Math.abs(parts.weightGap) / 0.25));
    slipWeeks += w;
    why.push(`Weight off the curve: up to ${w} weeks.`);
  }
  if (parts.volume.status === 'at-risk') {
    slipWeeks += 1;
    why.push('Yoke volume short this week: about 1 week.');
  }
  if (sig.injuryWeeks) {
    slipWeeks += sig.injuryWeeks[1];
    why.push(`Injured area out for ${sig.injuryWeeks[0]} to ${sig.injuryWeeks[1]} more weeks (typical ranges, individual times vary).`);
  }
  if (sig.redFlag) why.push('Open red flag: the range is unreliable until you have been seen.');
  const end = addDays(goal.to, slipWeeks * 7);
  const a = seasonWord(goal.from);
  const b = seasonWord(end);
  const label = a === b ? `${a}, on plan` : `${a} to ${b}`;
  if (date < BLOCKS[0].start) why.push('The plan has not started yet.');
  return { label, why };
}

export function guardian(date: ISODate, data: Data): GuardianView {
  const goal = resolveGoal(data);
  const sig = goalSignals(date, data);
  const volume = weekVolume(date, data, sig);
  const weight = weightPart(date, data, goal);
  const parts = { volume: volumePart(volume, sig), weight: { status: weight.status, reason: weight.reason }, strength: strengthPart(date, data, sig), consistency: consistencyPart(date, data) };
  const judged = (Object.entries(parts) as [keyof typeof parts, Part][]).filter(([, p]) => p.status !== 'not-judged');
  let worst: [string, Part] = judged.length ? judged.reduce((a, b) => (rank[b[1].status] > rank[a[1].status] ? b : a)) : ['none', { status: 'maintained', reason: 'Not enough data yet. Keep logging.' }];
  if (sig.redFlag) worst = ['redFlag', { status: 'at-risk', reason: `Medical care first: ${sig.redFlag}. Getting it checked protects 2029.` }];
  const status = worst[1].status as GoalStatus;
  // Slowed only because an injured area is resting: say so, and cap it at slowed.
  const protective = !sig.redFlag && (sig.pausedMuscles.size > 0 || sig.pausedLifts.size > 0) && parts.consistency.status !== 'at-risk' && parts.weight.status !== 'at-risk';
  const finalStatus: GoalStatus = protective && status === 'at-risk' && worst[0] === 'volume' ? 'slowed' : status;
  const why = judged.filter(([k]) => k !== worst[0]).map(([, p]) => p.reason);
  const kept = volume.filter((v) => FILL_PRIORITY.includes(v.muscle) && v.status === 'met').map((v) => `${v.muscle} ${v.projected}/${v.target}`);
  const paused = [...volume.filter((v) => v.status === 'paused').map((v) => `${v.muscle}: ${v.pausedWhy}`), ...[...sig.pausedLifts.entries()].map(([l, w]) => `${LIFTS[l].short}: ${w}`)];
  const actions = actionsFor(parts, volume, sig);
  const range = goalRange(goal, { ...parts, weightGap: weight.gap }, sig, date);
  const tradeoffs = [...sig.tradeoffs];
  if (protective) tradeoffs.unshift('Slowed on purpose: the injured area rests so it can heal. A re-injury would cost far more time than these weeks.');
  return { date, goal, status: finalStatus, reason: worst[1].reason, why, protective, parts, volume, kept, paused, actions, range, tradeoffs, prevention: sig.prevention, reassurance: reassurance(date, data) };
}

function actionsFor(parts: GuardianView['parts'], volume: MuscleWeek[], sig: GoalSignals): string[] {
  const out: string[] = [];
  if (sig.redFlag) out.push('Seek medical care before training the area again.');
  if (sig.prevention.length) out.push(sig.prevention[0]);
  for (const v of volume.filter((x) => x.status === 'short' && FILL_PRIORITY.includes(x.muscle)).slice(0, 2)) {
    out.push(`${v.muscle}: ${v.target - v.projected > 0 ? `${v.target - v.projected} more sets` : `one more day`} this week to reach ${v.target} on ${v.minDays}+ days.`);
  }
  if (parts.weight.status === 'not-judged') out.push('Weigh in 3 mornings this week so the trend can be judged.');
  if (parts.consistency.status === 'slowed' || parts.consistency.status === 'at-risk') out.push('Protect the heavy days first: Monday, Tuesday and Thursday.');
  if (parts.strength.status === 'at-risk') out.push(`${parts.strength.reason.replace(' not trained in 14 days.', '')}: get it in this week.`);
  if (!out.length) out.push('Keep the same rhythm. Nothing new.');
  return out.slice(0, 3);
}
