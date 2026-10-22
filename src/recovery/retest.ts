// Return-to-training retest: a conservative way to re-establish an e1RM after an injury or a layoff, or
// to replace an unverified benchmark. Never a max-effort test: one rep-out set stopped with reps in
// reserve (3 on spine-loaded lifts, 2 otherwise), capped at 10 reps. The logged e1RM uses the reps done
// (Epley), which underestimates by the reps in reserve: the conservative side. HEURISTIC protocol.
import { LIFTS } from '../plan';
import { diffDays } from '../engine/dates';
import { epley } from '../engine/formulas';
import { e1rmFor } from '../engine/loads';
import type { Data } from '../engine/model';
import { live } from '../engine/model';
import { equipmentFor } from '../plan/exercises';
import type { ISODate, LiftKey } from '../plan/types';
import { unitsOf } from '../engine/units';
import { testAllowed } from './adapt';
import { constraintsOn } from './constraints';
import { goalLiftsOf } from './lifts';
import type { WarmupSet } from './model';
import { suggestRamp } from './prevention';
import { eventsFor } from './state';
import { tagsFor } from './tags';

export const RETEST = { targetPct: 0.75, maxReps: 10, rirSpine: 3, rirOther: 2, clearedWithinDays: 56, layoffDays: 21, source: 'Coaching heuristic; Epley estimate', evidence: 'heuristic' } as const;

export interface RetestOffer {
  lift: LiftKey;
  name: string;
  reason: string;
  spine: boolean;
  rir: number;
  targetKg: number | null;
  ramp: WarmupSet[];
  added: boolean;
}

const regionsOf = (name: string) => {
  const t = tagsFor(name);
  return t ? [...t.regions, ...t.regions2] : null;
};

function whyRetest(lift: LiftKey, date: ISODate, data: Data): string | null {
  const name = LIFTS[lift].name;
  const regions = regionsOf(name);
  for (const i of data.recovery?.injuries ?? []) {
    if (i.kind === 'longTerm' || (regions && !regions.includes(i.region))) continue;
    const cleared = eventsFor(i.id, data, date).find((e) => e.event === 'cleared' || e.status === 'cleared');
    if (cleared && diffDays(date, cleared.date) <= RETEST.clearedWithinDays) return 'Back after an injury: find where you are before loading up.';
  }
  const logs = live(data.weights).filter((w) => !w.assumed && (w.lift === lift || w.exercise === name) && w.date < date);
  const last = logs.sort((a, b) => (a.date < b.date ? -1 : 1)).at(-1);
  if (last && diffDays(date, last.date) >= RETEST.layoffDays) return `Not trained for ${diffDays(date, last.date)} days: a fresh e1RM keeps loads honest.`;
  const info = e1rmFor(lift, date, data);
  if (info?.source === 'benchmark') return 'Your e1RM is an unverified benchmark: a conservative retest replaces it.';
  return null;
}

/** Lifts worth a retest today, only when nothing protected touches them (the injury status allows it). */
export function retestOffers(date: ISODate, data: Data): RetestOffer[] {
  const ctx = constraintsOn(date, data);
  const u = unitsOf(data.profile);
  const out: RetestOffer[] = [];
  for (const lift of [...new Set(goalLiftsOf(date, data))]) {
    if (ctx && !testAllowed({ lift }, ctx)) continue;
    const reason = whyRetest(lift, date, data);
    if (!reason) continue;
    const name = LIFTS[lift].name;
    const tg = tagsFor(name);
    const spine = !tg || tg.spinalLoad === 'moderate' || tg.spinalLoad === 'high';
    const info = e1rmFor(lift, date, data);
    const eq = equipmentFor(name);
    const added = !!LIFTS[lift].bodyweight;
    const targetKg = info && !added ? u.roundDown(info.e1rm * RETEST.targetPct, eq) : null;
    out.push({ lift, name, reason, spine, rir: spine ? RETEST.rirSpine : RETEST.rirOther, targetKg, ramp: targetKg ? suggestRamp(targetKg, eq, u) : [], added });
  }
  return out;
}

/** e1RM from a retest: the conservative value that gets logged, and the upper estimate counting reps in reserve. */
export function retestE1rm(kg: number, reps: number, rir: number): { logged: number; upper: number } {
  return { logged: Math.round(epley(kg, reps) * 10) / 10, upper: Math.round(epley(kg, reps + rir) * 10) / 10 };
}

