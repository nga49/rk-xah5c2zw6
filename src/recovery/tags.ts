// Exercise tags: what each movement demands of the body. Generic biomechanics only, never a person's
// condition. Keyed by the exact exercise names the plan serves (names are the identity of logged history).
import type { Movement, Region } from './model';

export type TagMuscle = 'Traps' | 'Side delts' | 'Rear delts' | 'Neck' | 'Back' | 'Front delts' | 'Chest' | 'Biceps' | 'Triceps' | 'Forearms' | 'Core' | 'Quads' | 'Glutes' | 'Hamstrings' | 'Calves';
export type Level = 'none' | 'low' | 'moderate' | 'high';
export type Kit = 'barbell' | 'dumbbells' | 'cable' | 'machines' | 'bands' | 'bodyweight' | 'pullup-bar' | 'sled' | 'trap-bar' | 'bench' | 'dip-bars' | 'back-extension';

export interface ExerciseTags {
  /** Muscle labels, in the plan's own words, so set counts match its rules. */
  primary: TagMuscle[];
  secondary: TagMuscle[];
  /** Body regions that take load (primary) or some load (secondary). */
  regions: Region[];
  regions2: Region[];
  /** Movement demands, for clinician-blocked movements. */
  moves: Movement[];
  spinalLoad: Level;
  kneeFlexion: 'none' | 'shallow' | 'mid' | 'deep';
  impact: Level;
  unilateral: boolean;
  /** Seated or chest-supported: no standing or bracing demand on the legs. */
  supported: boolean;
  kit: Kit[];
  /** Easier versions of the same movement, easiest last. */
  regressions?: string[];
  /** Different exercises for the same muscles. */
  alternatives?: string[];
}

export const EXERCISE_TAGS: Record<string, ExerciseTags> = {};

/** Tags for a served exercise name. Unknown names return null: callers treat null as the worst case. */
export function tagsFor(name: string): ExerciseTags | null {
  const clean = name.replace(/^3RM test: /, '');
  return EXERCISE_TAGS[clean] ?? null;
}
