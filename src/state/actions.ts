import { db } from '../db/db';
import { newId, now, patchDay, put, remove, setTask } from '../db/store';
import { addDays } from '../engine/dates';
import { epley } from '../engine/formulas';
import type { InsightAction } from '../engine/insights';
import type { CardioType, Checkin, DayRecord, Feel, Mark, ReadinessSnapshot, SessionType } from '../engine/model';
import type { PlannedExercise, SessionPlan } from '../engine/session';
import type { DayView } from '../engine/today';
import type { ISODate, LiftKey, SessionCode } from '../plan/types';
import { DAILY_CODE } from '../plan';
import { toast } from './hooks';

export async function saveCheckin(date: ISODate, c: Checkin): Promise<void> {
  await patchDay(date, { checkin: c, override: null });
}

export async function setOverride(date: ISODate, type: SessionType | null): Promise<void> {
  await patchDay(date, { override: type });
}

/** Keep the stored readiness snapshot in step with the engine, for history and charts. */
export async function syncReadiness(view: DayView): Promise<void> {
  const d = view.decision;
  if (!d.readiness) return;
  const snap: ReadinessSnapshot = { score: d.readiness.score, type: d.type, reasons: [d.reason], overridden: d.overridden };
  const prev = (await db.days.get(view.date))?.readiness;
  if (prev && prev.score === snap.score && prev.type === snap.type && prev.overridden === snap.overridden && prev.reasons[0] === snap.reasons[0]) return;
  await patchDay(view.date, { readiness: snap });
}

export const toggleTask = (date: ISODate, id: string, done: boolean) => setTask(date, id, done);

export async function setSteps(date: ISODate, steps: number | undefined): Promise<void> {
  await patchDay(date, { steps });
}

export async function setMobility(date: ISODate, minutes: number | undefined): Promise<void> {
  await patchDay(date, { mobilityMin: minutes });
}

export async function toggleCode(date: ISODate, i: number): Promise<void> {
  await patchDay(date, (d) => {
    const code = [...(d.code ?? DAILY_CODE.map(() => false))];
    code[i] = !code[i];
    return { code };
  });
}

/** Today's weigh-in or waist: one body row per day, updated in place. */
export async function logBodyToday(date: ISODate, patch: { weightKg?: number; waistCm?: number }): Promise<void> {
  const rows = await db.body.where('date').equals(date).toArray();
  const row = rows.find((r) => !r.deleted && !r.bodyFatPct && !r.photoIds?.length);
  await put('body', { ...(row ?? { id: newId(), date }), ...patch });
}

export async function logCardio(date: ISODate, type: CardioType, minutes: number, feel: 'easy' | 'moderate' | 'hard' = 'easy', avgHr?: number): Promise<void> {
  await put('cardio', { id: newId(), date, type, minutes, feel, avgHr });
}

// ---------------------------------------------------------------- the session

export async function tickSet(date: ISODate, key: string, count: number): Promise<void> {
  await patchDay(date, (d) => ({ session: { ...(d.session ?? {}), [key]: count } }));
}

/** Ticking an exercise saves the weight used (pre-filled with the suggestion). */
export async function logExercise(date: ISODate, ex: PlannedExercise, kg: number, mark: Mark | null = null, assumed = false): Promise<void> {
  const existing = (await db.weights.where('date').equals(date).toArray()).find((w) => !w.deleted && w.exercise === ex.name);
  await put('weights', { ...(existing ?? { id: newId() }), date, exercise: ex.name, kg, mark, lift: ex.lift, reps: ex.repsTop ?? undefined, sets: ex.sets, assumed, deleted: false });
}

export async function unlogExercise(date: ISODate, name: string): Promise<void> {
  const existing = (await db.weights.where('date').equals(date).toArray()).find((w) => !w.deleted && w.exercise === name);
  if (existing) await remove('weights', existing.id);
}

export async function markExercise(date: ISODate, name: string, mark: Mark | null): Promise<void> {
  const existing = (await db.weights.where('date').equals(date).toArray()).find((w) => !w.deleted && w.exercise === name);
  if (existing) await put('weights', { ...existing, mark });
}

/** Finish: session done, feedback saved, untouched exercises assumed done at the suggestion. */
export async function finishSession(date: ISODate, plan: SessionPlan, view: DayView, rpe: number | undefined, lifts: Partial<Record<LiftKey, Feel>>): Promise<void> {
  const logged = new Set((await db.weights.where('date').equals(date).toArray()).filter((w) => !w.deleted).map((w) => w.exercise));
  for (const ex of plan.exercises) {
    if (ex.role === 'test' || logged.has(ex.name) || ex.load?.kg == null) continue;
    await logExercise(date, ex, ex.load.kg, null, true);
  }
  const d = view.decision;
  const readiness: ReadinessSnapshot | undefined = d.readiness ? { score: d.readiness.score, type: d.type, reasons: [d.reason], overridden: d.overridden } : undefined;
  await patchDay(date, { sessionDone: true, sessionCode: plan.code, feedback: { rpe, lifts }, ...(readiness ? { readiness } : {}) });
  toast('Session saved');
}

/** A past session ticked off afterwards: marked done, with no weights or feedback invented. */
export async function markSessionDone(date: ISODate, code: SessionCode): Promise<void> {
  await patchDay(date, { sessionDone: true, sessionCode: code });
}

export async function reopenSession(date: ISODate): Promise<void> {
  await patchDay(date, { sessionDone: false });
}

export async function setTravel(date: ISODate, on: boolean): Promise<void> {
  await patchDay(date, { travelMode: on });
}

export async function pausePlan(date: ISODate, days: number): Promise<void> {
  await put('plan', { id: newId(), kind: 'pause', date, days });
  toast(`Plan paused ${days} days. The map slides.`);
}

/** End a pause early: keep only the days already used. */
export async function resumePlan(id: string, start: ISODate, today: ISODate): Promise<void> {
  const used = Math.max(0, Math.round((Date.parse(today) - Date.parse(start)) / 86400000));
  const row = await db.plan.get(id);
  if (!row || row.kind !== 'pause') return;
  if (used === 0) await remove('plan', id);
  else await put('plan', { ...row, days: used });
  toast('Plan resumed');
}

// ---------------------------------------------------------------- insight cards

export async function dismiss(id: string, date: ISODate): Promise<void> {
  await put('dismissed', { id, date });
}

export async function applyAction(a: InsightAction, date: ISODate): Promise<void> {
  switch (a.kind) {
    case 'applyKcal':
      await put('kcalAdjust', { id: newId(), block: a.block, offsetKcal: a.offset, date, reason: a.reason, sourceId: a.sourceId });
      toast(`${a.offset > 0 ? '+' : ''}${a.offset} kcal applied. Update Yazio.`);
      break;
    case 'startReload':
      await put('plan', { id: newId(), kind: 'reload', date: a.from, until: a.until });
      toast('Reload until Sunday');
      break;
    case 'acceptSwap':
      await put('plan', { id: newId(), kind: 'swap', date, weekStart: a.offer.weekStart, map: a.offer.map, reason: `Missed ${a.offer.missed}` });
      toast(`${a.offer.missed} today`);
      break;
    case 'acceptVariant':
      await put('plan', { id: newId(), kind: 'variant', date, slot: a.slot, lift: a.lift, fromBlock: a.fromBlock });
      toast('Variation set for the next block');
      break;
    case 'acceptOffset':
      await put('plan', { id: newId(), kind: 'liftOffset', date, lift: a.lift, kg: a.kg, fromBlock: a.fromBlock });
      toast('+2.5 kg next block');
      break;
    case 'startHabit':
      await dismiss(a.id, date);
      break;
    case 'open':
      window.location.hash = a.href;
      break;
  }
}

// ---------------------------------------------------------------- logs

export async function logMax(date: ISODate, lift: LiftKey, weightKg: number, reps: number, bodyweightKg?: number, source: 'test' | 'benchmark' = 'test', id = newId()): Promise<void> {
  const total = bodyweightKg != null ? weightKg + bodyweightKg : weightKg;
  await put('maxes', { id, date, lift, weightKg, reps, bodyweightKg, e1rm: epley(total, reps), source });
}

export async function saveDayPatch(date: ISODate, patch: Partial<DayRecord>): Promise<void> {
  await patchDay(date, patch);
}

export const yesterday = (d: ISODate) => addDays(d, -1);
export const stamp = () => now();
