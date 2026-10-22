// Stage 2 of the hook, before Guardian fills: protect rows, offer easier versions, add rehab and the
// return ramp. Pure: copies every row it changes and never mutates the core's output.
import { LIFTS } from '../plan';
import { equipmentFor, takesLoad } from '../plan/exercises';
import type { ISODate, LiftKey } from '../plan/types';
import { formatMedium } from '../engine/dates';
import { historyFor, accessoryProgress } from '../engine/loads';
import type { Data } from '../engine/model';
import { modsForType, repsTop, type BuildInput, type PlannedExercise, type SessionPlan, type TestItem } from '../engine/session';
import { unitsOf } from '../engine/units';
import { judge, type AreaRule, type Ctx } from './constraints';
import { painCheck } from './phases';
import { rehabFor, REHAB_CONDITION } from './rehab';
import { RAMP } from './rules';
import { rxFor, rxRows } from './rx';
import { tagsFor, type ExerciseTags, type Kit } from './tags';
import type { Core } from './volume';

/** Kit available today: a travel day has only bodyweight and bands; otherwise the full gym (Phase 8 refines). */
export type KitSet = Set<Kit> | null;
export const TRAVEL_KIT: KitSet = new Set<Kit>(['bodyweight', 'bands']);

export function kitOk(tg: ExerciseTags | null, kit: KitSet, data: Data, name: string): boolean {
  if (!tg) return false;
  if (name === 'Belt Squat' && !data.profile?.beltSquat) return false;
  if (name === 'Safety-bar Squat' && !data.profile?.safetyBar) return false;
  return !kit || tg.kit.every((k) => kit.has(k));
}

const rirNum = (r: string) => Number(r.match(/\d+/)?.[0] ?? 0);
export const atLeastRir = (r: string, min: string) => (rirNum(r) >= rirNum(min) ? r : min);

/** Stage 1: tests that would load a protected area wait; an accepted recovery block lowers the intensity. */
export function preBuild(input: BuildInput, ctx: Ctx): BuildInput {
  const tests = (input.tests ?? []).filter((t) => testAllowed(t, ctx));
  let mods = input.mods;
  if (ctx.block && !mods.recovery && !mods.rest) {
    const level = ctx.block.level;
    if (level === 'light' || (level === 'moderate' && mods.intensity === 'full')) mods = { ...mods, intensity: level, spine: mods.spine || level === 'light' };
  }
  if (ctx.ease && !ctx.block && mods.intensity === 'full' && !mods.recovery && !mods.rest && !mods.travel) mods = { ...mods, intensity: 'moderate' };
  return { ...input, mods, tests: ctx.block ? [] : tests };
}

export function testAllowed(t: Pick<TestItem, 'lift'>, ctx: Ctx): boolean {
  if (ctx.stop || ctx.block) return false;
  const name = LIFTS[t.lift].name;
  const tg = tagsFor(name);
  const v = judge(name, ctx, { main: true });
  if (!v.ok || v.ramp) return false;
  // No 3RM while any area it touches is still recovering.
  return !ctx.areas.some((a) => !tg || tg.regions.includes(a.region) || tg.regions2.includes(a.region));
}

/** The stop plan: no training at all, and the advice to seek care. */
export function stopPlan(input: BuildInput, core: Core, ctx: Ctx): SessionPlan {
  const base = core({ ...input, mods: modsForType('Recovery'), tests: [] });
  const stop = ctx.stop as NonNullable<Ctx['stop']>;
  return {
    ...base,
    title: 'Paused',
    kind: 'Seek medical care',
    focus: stop.advice,
    tone: 'ember',
    mods: { ...base.mods, recovery: true },
    exercises: [],
    skipped: [],
    cardio: [],
    notes: [stop.advice, `Red flag: ${stop.why}.`, 'Not medical advice.'],
    feedbackLifts: [],
  };
}

export interface Filtered {
  plan: SessionPlan;
  /** Sets removed (after easier versions were added back). */
  removed: number;
  /** For each protected row: the row and the area that protected it. */
  blocked: { row: PlannedExercise; area?: AreaRule; why: string }[];
  ramped: LiftKey[];
}

function loadFor(name: string, date: ISODate, data: Data): PlannedExercise['load'] {
  const eq = equipmentFor(name);
  if (!takesLoad(eq)) return null;
  const u = unitsOf(data.profile);
  const p = accessoryProgress(name, data.weights, date, u);
  return p.kg == null ? { kg: null, why: ['No weight logged yet. Pick a load you can lift with 3 reps to spare.'], badge: null } : { kg: p.kg, why: [`Last used ${u.w(p.lastKg as number)}.`], badge: null };
}

/** The last real working weight before the injury started: the fixed reference for the ramp. */
function rampReference(name: string, area: AreaRule, data: Data): number | null {
  const real = historyFor(name, data.weights, area.injury.start).filter((w) => !w.assumed);
  return real.at(-1)?.kg ?? null;
}

/** Ramp step: one step per logged session since Return began that passed the pain rule. */
export function rampStep(name: string, area: AreaRule, date: ISODate, data: Data): number {
  const since = area.view.since;
  const dates = [...new Set(data.weights.filter((w) => !w.deleted && !w.assumed && w.exercise === name && w.date >= since && w.date < date).map((w) => w.date))].sort();
  const checks = area.active.checkins;
  let step = 0;
  for (const d of dates) {
    const next = checks.find((c) => c.date > d) ?? checks.find((c) => c.date === d);
    const r = next ? painCheck(next, checks.filter((c) => c.date < next.date)) : { ok: null };
    if (r.ok !== false) step += 1;
  }
  return Math.min(RAMP.steps.length - 1, step);
}

export function filterSession(plan: SessionPlan, input: BuildInput, ctx: Ctx, kit: KitSet): Filtered {
  const { data, date } = input;
  const u = unitsOf(data.profile);
  const kept: PlannedExercise[] = [];
  const skipped = [...plan.skipped];
  const blocked: Filtered['blocked'] = [];
  const ramped: LiftKey[] = [];
  let removed = 0;

  for (const e of plan.exercises) {
    // A gym profile: rows that need kit this gym lacks are swapped or skipped, like a protected row.
    if (ctx.enforceKit && kit && e.role !== 'test' && !kitOk(tagsFor(e.name), kit, data, e.name)) {
      const why = `Not at ${ctx.kitLabel ?? 'this gym'}: needs ${tagsFor(e.name)?.kit.filter((k) => !kit.has(k)).join(', ') ?? 'other kit'}`;
      skipped.push({ name: e.name, why });
      blocked.push({ row: e, why });
      removed += e.sets;
      continue;
    }
    const v = judge(e.name, ctx, { main: e.role === 'main' || e.role === 'test' });
    if (!v.ok) {
      skipped.push({ name: e.name, why: v.why });
      blocked.push({ row: e, area: v.area, why: v.why });
      removed += e.sets;
      continue;
    }
    if (!v.rir && !v.ramp && !v.note) {
      kept.push(e);
      continue;
    }
    const row: PlannedExercise = { ...e, changes: [...e.changes] };
    if (v.rir) row.rir = atLeastRir(row.rir, v.rir);
    if (v.note && !row.conditional) row.conditional = v.note;
    if (v.ramp && row.load?.kg != null) {
      const ref = rampReference(e.name, v.ramp, data) ?? row.load.kg;
      const step = rampStep(e.name, v.ramp, date, data);
      const pct = RAMP.steps[step];
      const kg = Math.min(row.load.kg, u.roundDown(ref * pct, row.equipment));
      row.load = { ...row.load, kg, badge: 'down', badgeText: `${Math.round(pct * 100)}%`, badgeReason: 'Return ramp', why: [...row.load.why, `Return ramp step ${step + 1} of ${RAMP.steps.length}: ${Math.round(pct * 100)}% of ${u.w(ref)}, your last working weight before the injury.`] };
      row.rir = atLeastRir(row.rir, RAMP.rir);
      row.changes.push(`Return ramp: ${Math.round(pct * 100)}% of the pre-injury load`);
      if (row.lift) ramped.push(row.lift);
    } else if (v.otherSide) {
      row.changes.push(`Other leg only: ${v.otherSide.name} rests`);
    } else if (v.rir) {
      row.changes.push(`Injury: RIR ${v.rir} or more`);
    }
    kept.push(row);
  }

  // Easier versions of protected rows, when an allowed one exists (keyed REC:).
  const names = new Set(kept.map((e) => e.name));
  for (const b of blocked) {
    if (b.row.role === 'test' || b.row.role === 'finisher') continue;
    const tg = tagsFor(b.row.name);
    const options = [...(tg?.regressions ?? []), ...(tg?.alternatives ?? [])];
    const pick = options.find((n) => !names.has(n) && kitOk(tagsFor(n), kit, data, n) && judge(n, ctx, { added: true }).ok);
    if (!pick) continue;
    const v = judge(pick, ctx, { added: true });
    const ptg = tagsFor(pick) as ExerciseTags;
    names.add(pick);
    removed -= b.row.sets;
    kept.push({
      key: `REC:${b.row.key}`,
      name: pick,
      originalName: b.row.originalName,
      sets: b.row.sets,
      reps: b.row.reps,
      repsTop: repsTop(b.row.reps),
      rest_s: b.row.rest_s,
      muscles: [...ptg.primary],
      perSide: ptg.unilateral || undefined,
      role: 'accessory',
      equipment: equipmentFor(pick),
      rir: atLeastRir(b.row.rir, v.ok && v.rir ? v.rir : '2'),
      load: loadFor(pick, date, data),
      changes: [`Easier version of ${b.row.name}: ${b.area?.label ?? 'protected'}`],
      conditional: v.ok ? v.note : undefined,
    });
  }

  // A physio's prescription replaces the generic rehab for that area, in any phase but a red flag.
  // Otherwise generic rehab in Load or Build, unless a clinician set restrictions for it (follow theirs).
  if (plan.code && !plan.mods.recovery) {
    for (const a of ctx.areas) {
      const rx = rxFor(a.injury.id, date, data);
      if (rx) {
        if (a.level !== 'stop') for (const row of rxRows(rx, date, a.name)) if (!names.has(row.name)) (names.add(row.name), kept.push(row));
        continue;
      }
      const items = rehabFor(a.region, a.level);
      if (!items.length || a.injury.restrictions?.blocked?.length) continue;
      items.forEach((it, i) => {
        if (names.has(it.name)) return;
        names.add(it.name);
        kept.push({
          key: `REHAB:${a.injury.id}:${i}`,
          name: it.name,
          originalName: it.name,
          sets: it.sets,
          reps: it.reps,
          repsTop: null,
          rest_s: it.rest_s,
          muscles: [],
          perSide: it.perSide,
          role: 'accessory',
          equipment: 'none',
          rir: '3',
          load: null,
          changes: [`Rehab: ${a.label}`],
          conditional: REHAB_CONDITION,
        });
      });
    }
  }

  return { plan: { ...plan, exercises: kept, skipped }, removed: Math.max(0, removed), blocked, ramped };
}

/** Last pass: unique names (logs are keyed by date and name), feedback only for unramped main lifts, one top note. */
export function finish(plan: SessionPlan, ctx: Ctx, f: Filtered, added: number): SessionPlan {
  const seen = new Set<string>();
  const exercises = plan.exercises.filter((e) => (seen.has(e.name) ? false : (seen.add(e.name), true)));
  const mainLeft = new Set(exercises.filter((e) => e.role === 'main' && e.lift).map((e) => e.lift as LiftKey));
  const feedbackLifts = plan.feedbackLifts.filter((l) => mainLeft.has(l) && !f.ramped.includes(l));
  const notes = [...plan.notes];
  if (ctx.areas.length) {
    const parts = [ctx.areas.map((a) => a.label).join(', ')];
    if (f.blocked.length) parts.push(`${f.blocked.length} protected`);
    if (added) parts.push(`${added} sets added for the goal`);
    notes.unshift(`Injury plan: ${parts.join(' · ')}.`);
  }
  if (ctx.ease && !ctx.block) notes.unshift(`Easier day: ${ctx.ease}.`);
  if (ctx.enforceKit && ctx.kitLabel) notes.push(`Gym: ${ctx.kitLabel}. Exercises it cannot host are swapped or skipped.`);
  if (ctx.block) notes.unshift(`Recovery block until ${formatMedium(ctx.block.until)}: ${ctx.block.reason}. One more rep in reserve on everything.`);
  const rows = ctx.block ? exercises.map((e) => ({ ...e, rir: atLeastRir(e.rir, String(rirNum(e.rir) + 1)) })) : exercises;
  return { ...plan, exercises: rows, feedbackLifts, notes };
}
