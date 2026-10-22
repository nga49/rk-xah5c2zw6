// Goal Guardian redistribution: redistribute, don't delete. When an injury removes sets, spare capacity
// goes to goal priorities (yoke first, then upper back, shoulders within limits, arms), within caps.
// The fill plan depends only on the projected week, never on logs, so a day's session never changes after
// the fact. All caps are coaching heuristics (see FILL in rules.ts).
import { addDays, startOfWeek } from '../engine/dates';
import type { Data } from '../engine/model';
import { getPosition } from '../engine/position';
import { scheduledCode } from '../engine/schedule';
import { modsForType, type BuildInput, type PlannedExercise, type SessionPlan } from '../engine/session';
import { equipmentFor } from '../plan/exercises';
import type { ISODate, LiftKey } from '../plan/types';
import { kitOk, TRAVEL_KIT, filterSession, preBuild, type KitSet } from './adapt';
import { constraintsOn, judge, unsafeFill, type Ctx } from './constraints';
import { FILL } from './rules';
import { tagsFor } from './tags';
import { addSession, FILL_PRIORITY, floorFor, FLOOR, musclesOf, type Core, type GoalMuscle, type MuscleCount } from './volume';
import { accessoryProgress } from '../engine/loads';
import { takesLoad } from '../plan/exercises';
import { unitsOf } from '../engine/units';

/** Existing library names only, so loads have history. Supported and seated first. */
export const POOL: Partial<Record<GoalMuscle, string[]>> = {
  Traps: ['Seated Dumbbell Shrug', 'Cable Shrug'],
  'Side delts': ['Machine Lateral Raise', 'One-arm Cable Lateral Raise', 'Dumbbell Lateral Raise', 'Lean-away Dumbbell Lateral Raise'],
  'Rear delts': ['Machine Reverse Fly', 'Incline Reverse Fly', 'Face Pull', 'Reverse Cable Fly', 'Rear Delt Cable Fly', 'Band Pull-apart'],
  Neck: ['Neck Flexion + Extension'],
  Back: ['Chest Supported Dumbbell Row', 'Seal Row', 'Chest-supported T-bar Row', 'Single-arm Cable Row'],
  'Front delts': ['Machine Incline Press', 'Incline Dumbbell Bench Press'],
  Biceps: ['Incline Dumbbell Biceps Curl', 'Spider Curl', 'Cable Curl', 'Dumbbell Curl'],
  Triceps: ['Rope Pushdown', 'Cable Triceps Pushdown', 'Single-arm Cable Pushdown'],
  Forearms: ['Wrist Curl + Reverse Wrist Curl'],
  Chest: ['Machine Incline Press', 'Incline Dumbbell Bench Press', 'Push-up'],
  Core: ['Pallof Press', 'Side Plank', 'Dead Bug'],
};

export interface PlannedFill {
  muscle: GoalMuscle;
  name?: string;
  /** +1 set on an existing row instead of a new exercise. */
  bumpKey?: string;
  sets: number;
  why: string;
}

export interface WeekDay {
  date: ISODate;
  ctx: Ctx | null;
  original: SessionPlan | null;
  adapted: SessionPlan | null;
  removed: number;
  kit: KitSet;
}

export interface WeekPlan {
  days: WeekDay[];
  original: MuscleCount;
  adapted: MuscleCount;
  fills: Map<ISODate, PlannedFill[]>;
  paused: Map<GoalMuscle, string>;
  pausedLifts: Map<LiftKey, string>;
}

const memo = new WeakMap<Data, Map<ISODate, WeekPlan>>();

export function weekPlan(date: ISODate, data: Data, core: Core): WeekPlan {
  const monday = startOfWeek(date);
  let m = memo.get(data);
  if (!m) memo.set(data, (m = new Map()));
  const hit = m.get(monday);
  if (hit) return hit;
  const plan = buildWeek(monday, data, core);
  m.set(monday, plan);
  return plan;
}

function buildWeek(monday: ISODate, data: Data, core: Core): WeekPlan {
  const days: WeekDay[] = [];
  const original: MuscleCount = {};
  const adapted: MuscleCount = {};
  const pausedWhy = new Map<GoalMuscle, string>();
  const pausedLifts = new Map<LiftKey, string>();
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    const pos = getPosition(date, data.plan);
    const code = pos.status === 'active' ? scheduledCode(date, data) : null;
    const ctx = constraintsOn(date, data);
    if (!code) {
      days.push({ date, ctx, original: null, adapted: null, removed: 0, kit: null });
      continue;
    }
    const travel = !!data.days.get(date)?.travelMode;
    const kit = travel ? TRAVEL_KIT : null;
    const input: BuildInput = { date, code, pos, mods: modsForType(travel ? 'Travel' : 'Full'), data };
    const o = core(input);
    addSession(original, o.exercises);
    if (!ctx) {
      addSession(adapted, o.exercises);
      days.push({ date, ctx, original: o, adapted: o, removed: 0, kit });
      continue;
    }
    if (ctx.stop) {
      days.push({ date, ctx, original: o, adapted: null, removed: 0, kit });
      continue;
    }
    const pre = preBuild(input, ctx);
    const f = filterSession(core(pre), pre, ctx, kit);
    addSession(adapted, f.plan.exercises);
    for (const b of f.blocked) {
      for (const mu of musclesOf(b.row)) if (!pausedWhy.has(mu)) pausedWhy.set(mu, b.area?.label ?? b.why);
      if (b.row.lift && b.row.role === 'main') pausedLifts.set(b.row.lift, b.area?.label ?? b.why);
    }
    for (const l of f.ramped) if (!pausedLifts.has(l)) pausedLifts.set(l, 'return ramp');
    days.push({ date, ctx, original: o, adapted: f.plan, removed: f.removed, kit });
  }
  // A muscle is paused only when every row that trained it this week is protected.
  const paused = new Map<GoalMuscle, string>();
  for (const [mu, why] of pausedWhy) if ((original[mu]?.sets ?? 0) > 0 && !(adapted[mu]?.sets ?? 0)) paused.set(mu, why);
  return { days, original, adapted, fills: planFills(days, original, adapted, paused, data), paused, pausedLifts };
}

function planFills(days: WeekDay[], original: MuscleCount, adapted: MuscleCount, paused: Map<GoalMuscle, string>, data: Data): Map<ISODate, PlannedFill[]> {
  const out = new Map<ISODate, PlannedFill[]>();
  const added: Partial<Record<GoalMuscle, number>> = {};
  const addedDays: Partial<Record<GoalMuscle, number>> = {};
  const trains = (d: WeekDay | undefined, mu: GoalMuscle) => !!d?.original?.exercises.some((e) => musclesOf(e).includes(mu));
  const need = (mu: GoalMuscle) => {
    const o = original[mu] ?? { sets: 0, days: 0 };
    const a = adapted[mu] ?? { sets: 0, days: 0 };
    const target = Math.min(floorFor(mu), o.sets);
    const sets = Math.max(0, target - a.sets - (added[mu] ?? 0));
    const dayShort = a.days + (addedDays[mu] ?? 0) < Math.min(FLOOR.days, o.days);
    return { sets, dayShort, bonus: Math.max(0, o.sets + FILL.bonusPerMuscle - a.sets - (added[mu] ?? 0)) };
  };
  days.forEach((d, i) => {
    if (!d.ctx || !d.adapted || d.removed <= 0 || d.ctx.noFill || d.ctx.stop) return;
    let budget = Math.min(FILL.perDayMax, d.removed);
    let newRows = 0;
    const today: PlannedFill[] = [];
    const names = new Set(d.adapted.exercises.map((e) => e.name));
    const muscles = FILL_PRIORITY.filter((mu) => !paused.has(mu) && (original[mu]?.sets ?? 0) > 0);
    const order = [...muscles.filter((mu) => need(mu).sets > 0 || need(mu).dayShort), ...muscles];
    const done = new Set<GoalMuscle>();
    for (const mu of order) {
      if (budget < 1 || done.has(mu)) continue;
      // Never a third day in a row for a muscle.
      if (trains(days[i - 1], mu) && trains(days[i + 1], mu)) continue;
      const n = need(mu);
      const amount = n.sets > 0 ? n.sets : n.dayShort ? FILL.setsMin : n.bonus;
      if (amount <= 0) continue;
      const why = n.sets > 0 || n.dayShort ? `${mu} under the weekly rule` : `${mu}: goal priority`;
      const row = d.adapted.exercises.find((e) => e.role === 'accessory' && !e.key.startsWith('REHAB:') && musclesOf(e).includes(mu));
      if (amount === 1 && row) {
        today.push({ muscle: mu, bumpKey: row.key, sets: 1, why });
        added[mu] = (added[mu] ?? 0) + 1;
        budget -= 1;
        done.add(mu);
        continue;
      }
      if (newRows >= FILL.newRowsMax) continue;
      const sets = Math.min(FILL.setsMax, amount, budget);
      if (sets < FILL.setsMin) continue;
      const name = (POOL[mu] ?? []).find((nm) => {
        const tg = tagsFor(nm);
        return !names.has(nm) && !unsafeFill(tg) && kitOk(tg, d.kit, data, nm) && judge(nm, d.ctx as Ctx, { added: true }).ok;
      });
      if (!name) continue;
      names.add(name);
      today.push({ muscle: mu, name, sets, why });
      added[mu] = (added[mu] ?? 0) + sets;
      if (!row) addedDays[mu] = (addedDays[mu] ?? 0) + 1;
      budget -= sets;
      newRows += 1;
      done.add(mu);
    }
    if (today.length) out.set(d.date, today);
  });
  return out;
}

/** Apply this day's planned fills to the real session. Skipped on light days and whenever fills are off. */
export function applyFills(plan: SessionPlan, input: BuildInput, ctx: Ctx, week: WeekPlan): { plan: SessionPlan; added: number } {
  const planned = week.fills.get(input.date);
  if (!planned?.length || ctx.noFill || ctx.stop || input.mods.intensity === 'light' || input.mods.recovery || !plan.code) return { plan, added: 0 };
  const u = unitsOf(input.data.profile);
  const exercises = plan.exercises.map((e) => ({ ...e }));
  const names = new Set(exercises.map((e) => e.name));
  const protectedText = ctx.areas.map((a) => a.name).join(', ') || 'an area';
  let added = 0;
  planned.forEach((f, i) => {
    if (f.bumpKey) {
      const row = exercises.find((e) => e.key === f.bumpKey);
      if (!row) return;
      row.sets += 1;
      row.changes = [...row.changes, `+1 set for the goal: ${protectedText} protected`];
      added += 1;
      return;
    }
    const name = f.name as string;
    if (names.has(name) || !judge(name, ctx, { added: true }).ok) return;
    const tg = tagsFor(name);
    if (!tg) return;
    names.add(name);
    const eq = equipmentFor(name);
    const p = takesLoad(eq) ? accessoryProgress(name, input.data.weights, input.date, u) : null;
    const row: PlannedExercise = {
      key: `GOAL:${input.date}:${i}`,
      name,
      originalName: name,
      sets: f.sets,
      reps: '10-15',
      repsTop: 15,
      rest_s: 60,
      muscles: [...tg.primary],
      perSide: tg.unilateral || undefined,
      role: 'accessory',
      equipment: eq,
      rir: FILL.rir,
      load: p ? (p.kg == null ? { kg: null, why: ['No weight logged yet. Pick a load you can lift for 15 with 2 to spare.'], badge: null } : { kg: p.kg, why: [`Last used ${u.w(p.lastKg as number)}.`], badge: null }) : null,
      changes: [`Added for the goal: ${protectedText} protected`],
    };
    exercises.push(row);
    added += f.sets;
  });
  return { plan: { ...plan, exercises }, added };
}
