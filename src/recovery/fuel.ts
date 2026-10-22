// Recovery nutrition: protein target tracking and a cut / maintenance / surplus switch. Suggestions only:
// the owner confirms, and calories change through the app's existing calorie action (additive rows).
import { BLOCKS } from '../plan';
import { addDays } from '../engine/dates';
import { bodyweightOn } from '../engine/loads';
import type { Data } from '../engine/model';
import { live } from '../engine/model';
import { getPosition } from '../engine/position';
import type { ISODate } from '../plan/types';
import { constraintsOn } from './constraints';
import type { RecordOf } from './model';

export type Mode = 'cut' | 'maintenance' | 'surplus';
export const MODE_WORD: Record<Mode, string> = { cut: 'Cut', maintenance: 'Maintenance', surplus: 'Surplus' };

/**
 * Protein while injured: about 2.0 to 2.5 g per kg a day is often suggested (Tipton KD, Sports Med 2015;
 * 45 Suppl 1: expert review, not trials). The app uses 2.0 g/kg as the floor, never below the plan's own
 * target. People with kidney problems should ask a doctor first.
 */
export const PROTEIN = { injuredGPerKg: 2.0, source: 'Tipton 2015, Sports Med 45 Suppl 1 (expert review)', evidence: 'partly' } as const;

/** Small surplus and cut steps when switching away from the plan. HEURISTIC; 7,700 kcal per kg is a crude rule. */
export const STEPS = { surplus: 250, cut: 300, cap: 600, kcalPerKg: 7700, source: 'Coaching heuristic', evidence: 'heuristic' } as const;

function blockOf(date: ISODate, data: Data) {
  const pos = getPosition(date, data.plan);
  return pos.status === 'active' ? BLOCKS.find((b) => b.code === pos.block.code) ?? null : null;
}

export function planMode(date: ISODate, data: Data): Mode {
  const b = blockOf(date, data);
  if (!b) return 'maintenance';
  return b.phase === 'cut' || b.phase === 'mini' ? 'cut' : b.phase === 'build' ? 'surplus' : 'maintenance';
}

/** The block's planned daily energy gap from its weight change (deficit positive), rounded to 50 kcal. */
export function plannedGap(date: ISODate, data: Data): number {
  const b = blockOf(date, data);
  if (!b) return 0;
  const perDay = (((b.w0 - b.w1) / b.weeks) * STEPS.kcalPerKg) / 7;
  return Math.max(-STEPS.cap, Math.min(STEPS.cap, Math.round(perDay / 50) * 50));
}

/** Calories to add to the plan for a mode (negative takes away). */
export function offsetFor(mode: Mode, date: ISODate, data: Data): number {
  const plan = planMode(date, data);
  if (mode === plan) return 0;
  const gap = plannedGap(date, data);
  if (plan === 'cut') return mode === 'maintenance' ? gap : gap + STEPS.surplus;
  if (plan === 'surplus') return mode === 'maintenance' ? gap : gap - STEPS.cut;
  return mode === 'cut' ? -STEPS.cut : STEPS.surplus;
}

/** Calories the module has added to this block so far (rows it applied through the calorie action). */
export function moduleOffset(date: ISODate, data: Data): number {
  const b = blockOf(date, data);
  if (!b) return 0;
  return live(data.kcalAdjust).filter((k) => k.block === b.code && k.date <= date && k.sourceId?.startsWith('rec:')).reduce((s, k) => s + k.offsetKcal, 0);
}

export function currentMode(date: ISODate, data: Data): Mode {
  const b = blockOf(date, data);
  const rec = (data.recovery?.records ?? [])
    .filter((r): r is RecordOf<'nutrition'> => r.kind === 'nutrition' && r.date <= date && !!b && r.date >= b.start)
    .sort((x, y) => (x.date === y.date ? x.updatedAt - y.updatedAt : x.date < y.date ? -1 : 1))
    .at(-1);
  if (rec) return rec.mode;
  const off = moduleOffset(date, data);
  if (!off) return planMode(date, data);
  return (['cut', 'maintenance', 'surplus'] as Mode[]).reduce((best, m) => (Math.abs(offsetFor(m, date, data) - off) < Math.abs(offsetFor(best, date, data) - off) ? m : best), planMode(date, data));
}

/** What the engine suggests: maintenance while an injury is in Protect or Load during a cut. */
export function suggestedMode(date: ISODate, data: Data): { mode: Mode; why: string } | null {
  const ctx = constraintsOn(date, data);
  const acute = ctx?.areas.find((a) => a.level === 'protect' || a.level === 'load' || a.level === 'stop');
  if (acute && planMode(date, data) === 'cut') return { mode: 'maintenance', why: `${acute.name} is healing: pause the deficit, keep protein high.` };
  return null;
}

// ---------------------------------------------------------------- protein

export const proteinId = (date: ISODate) => `pr:${date}`;
export const proteinOn = (date: ISODate, data: Data) => (data.recovery?.records ?? []).find((r): r is RecordOf<'protein'> => r.kind === 'protein' && r.id === proteinId(date))?.grams ?? 0;

export function proteinTarget(date: ISODate, data: Data): { grams: number; plan: number; why: string } {
  const b = blockOf(date, data);
  const plan = b?.p ?? 0;
  const injured = !!constraintsOn(date, data)?.areas.length;
  const bw = bodyweightOn(date, data);
  const floor = injured && bw ? Math.round(PROTEIN.injuredGPerKg * bw) : 0;
  if (floor > plan) return { grams: floor, plan, why: `${PROTEIN.injuredGPerKg} g per kg while injured (${Math.round(bw as number)} kg), above the plan's ${plan} g.` };
  return { grams: plan, plan, why: injured ? `Plan target ${plan} g, already at or above ${PROTEIN.injuredGPerKg} g per kg.` : `Plan target for block ${b?.code ?? ''}.` };
}

/** Days in the last 7 at 90% of the target or more, among days with a logged amount. */
export function proteinWeek(date: ISODate, data: Data): { logged: number; hit: number } {
  let logged = 0;
  let hit = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(date, -i);
    const g = proteinOn(d, data);
    if (!g) continue;
    logged += 1;
    if (g >= proteinTarget(d, data).grams * 0.9) hit += 1;
  }
  return { logged, hit };
}
