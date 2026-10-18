import { TEMPLATES } from '../plan';
import type { DayTemplate } from '../plan/types';

export interface MuscleVolume {
  sets: number;
  days: number;
}

/** The six days of a template: Strength, or Volume (Mon, Tue, Thu overridden). */
export function weekOf(tpl: 'S' | 'H'): DayTemplate[] {
  if (tpl === 'S') return TEMPLATES.strength;
  return TEMPLATES.strength.map((d) => TEMPLATES.volume_overrides.find((v) => v.code === d.code) ?? d);
}

/** Weekly direct sets and training days per muscle (6.3). A muscle listed twice counts twice. */
export function weeklySets(tpl: 'S' | 'H'): Record<string, MuscleVolume> {
  const out: Record<string, MuscleVolume> = {};
  for (const day of weekOf(tpl)) {
    const seen = new Set<string>();
    for (const ex of day.exercises) {
      for (const m of ex.muscles) {
        out[m] ??= { sets: 0, days: 0 };
        out[m].sets += ex.sets;
        if (!seen.has(m)) {
          seen.add(m);
          out[m].days += 1;
        }
      }
    }
  }
  return out;
}
