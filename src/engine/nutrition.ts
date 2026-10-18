import type { ISODate } from '../plan/types';
import { addDays } from './dates';
import { fmtKg, weeklyAverage } from './formulas';
import type { Data } from './model';
import { live } from './model';
import type { Position } from './position';
import { unitsOf } from './units';

export interface Targets {
  kcal: number;
  p: number;
  f: number;
  c: number;
  offset: number;
}

/** Block targets plus accepted adjustments for this block; carbs move by kcal / 4 (5.5). */
export function targetsFor(pos: Position, data: Data): Targets {
  const offset = live(data.kcalAdjust).filter((k) => k.block === pos.block.code).reduce((s, k) => s + k.offsetKcal, 0);
  const b = pos.block;
  return { kcal: b.kcal + offset, p: b.p, f: b.f, c: Math.round(b.c + offset / 4), offset };
}

export interface KcalSuggestion {
  id: string;
  offset: number;
  title: string;
  why: string[];
}

export interface NutritionCheck {
  suggestion: KcalSuggestion | null;
  /** Said instead of guessing when weigh-ins are missing. */
  missing: string | null;
  ratePerWeek: number | null;
}

const PHASE_WORD: Record<string, string> = { cut: 'cut', mini: 'mini-cut', build: 'build', hold: 'hold', maint: 'keep', review: 'reassess' };

/** 14-day weekly-average slope vs the phase (5.5, 5.3b.5). Evaluated on block days 14 and 28. */
export function nutritionCheck(pos: Position, data: Data): NutritionCheck {
  const none: NutritionCheck = { suggestion: null, missing: null, ratePerWeek: null };
  if (pos.status !== 'active') return none;
  const evalDay = Math.floor(pos.dayInBlock / 14) * 14;
  const out: NutritionCheck = { ...none };
  const applied = (id: string) => data.dismissed.has(id) || live(data.kcalAdjust).some((k) => k.sourceId === id);

  if (evalDay >= 14) {
    const evalDate: ISODate = addDays(pos.date, -(pos.dayInBlock - evalDay));
    const now = weeklyAverage(data.body, evalDate);
    const then = weeklyAverage(data.body, addDays(evalDate, -14));
    if (now == null || then == null) {
      out.missing = 'Need 3 weigh-ins a week to judge calories. No change until then.';
    } else {
      const rate = (now - then) / 2;
      out.ratePerWeek = rate;
      const phase = pos.block.phase;
      const u = unitsOf(data.profile);
      const per = (kg: number) => `${u.w(kg)} a week`;
      let offset = 0;
      let reason = '';
      if (phase === 'cut' || phase === 'mini') {
        if (rate < -0.5) { offset = 150; reason = 'Losing faster than ' + per(0.5); }
        else if (rate > -0.1) { offset = -150; reason = 'Losing slower than ' + per(0.1); }
      } else if (phase === 'build') {
        if (rate > 0.2) { offset = -100; reason = 'Gaining faster than ' + per(0.2); }
        else if (rate < 0.05) { offset = 100; reason = 'Gaining slower than ' + per(0.05); }
      } else if (rate > 0.2) { offset = -100; reason = 'Weight drifting up more than ' + per(0.2); }
      else if (rate < -0.2) { offset = 100; reason = 'Weight drifting down more than ' + per(0.2); }
      const id = `kcal:${pos.block.code}:${evalDay}`;
      if (offset && !applied(id)) {
        out.suggestion = {
          id,
          offset,
          title: `${offset > 0 ? '+' : ''}${offset} kcal`,
          why: [`${reason} (${u.rate(rate)}, 14-day trend).`, `Phase: ${PHASE_WORD[phase]}.`],
        };
      }
    }
  }

  // Waist up 2 cm or more this block with no strength gain (5.5, 5.3b.4).
  const waists = live(data.body).filter((b) => b.waistCm != null && b.date >= pos.blockStart && b.date <= pos.date).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!out.suggestion && waists.length >= 2) {
    const rise = (waists[waists.length - 1].waistCm as number) - (waists[0].waistCm as number);
    const id = `waist:${pos.block.code}`;
    if (rise >= 2 && !strengthGainedSince(pos.blockStart, pos.date, data) && !applied(id)) {
      out.suggestion = { id, offset: -100, title: '-100 kcal', why: [`Waist +${fmtKg(Math.round(rise * 10) / 10)} cm this block, no e1RM gain.`, 'Check sleep first.'] };
    }
  }
  return out;
}

/** A tested e1RM this period beat the lift's previous best. */
export function strengthGainedSince(from: ISODate, to: ISODate, data: Data): boolean {
  const maxes = live(data.maxes);
  return maxes.some((m) => {
    if (m.source !== 'test' || m.date < from || m.date > to) return false;
    const before = maxes.filter((x) => x.lift === m.lift && x.date < from).map((x) => x.e1rm);
    return !before.length || m.e1rm > Math.max(...before);
  });
}
