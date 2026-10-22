// Weekly set counting per muscle, for the Goal Guardian and for redistribution.
// Pure. Never imports computeDay or UI code, so the session hook can use it.
import { addDays, startOfWeek } from '../engine/dates';
import type { Data, DayRecord } from '../engine/model';
import { getPosition } from '../engine/position';
import { scheduledCode } from '../engine/schedule';
import { modsForType, type BuildInput, type PlannedExercise, type SessionPlan } from '../engine/session';
import type { ISODate } from '../plan/types';
import { tagsFor } from './tags';

/** The 15 muscle labels the plan's templates use (closed list). */
export const GOAL_MUSCLES = ['Traps', 'Side delts', 'Rear delts', 'Neck', 'Back', 'Front delts', 'Chest', 'Biceps', 'Triceps', 'Forearms', 'Core', 'Quads', 'Glutes', 'Hamstrings', 'Calves'] as const;
export type GoalMuscle = (typeof GOAL_MUSCLES)[number];

/** The yoke drives the look (North Star): traps, side and rear delts, neck. */
export const YOKE: GoalMuscle[] = ['Traps', 'Side delts', 'Rear delts', 'Neck'];

/** Where blocked capacity goes first: yoke, upper back, shoulders (within limits), arms. */
export const FILL_PRIORITY: GoalMuscle[] = ['Traps', 'Side delts', 'Rear delts', 'Neck', 'Back', 'Front delts', 'Biceps', 'Triceps', 'Forearms', 'Chest', 'Core'];

/**
 * The owner's training rule: every muscle 2+ times a week and 10+ sets, neck 8.
 * Source: plan rules (DEFAULT_RULES in src/plan/content.ts), pinned by tests/plan-engine.test.ts. Evidence: plan rule.
 */
export const FLOOR = { sets: 10, neck: 8, days: 2 } as const;
export const floorFor = (m: GoalMuscle) => (m === 'Neck' ? FLOOR.neck : FLOOR.sets);

const isModuleRow = (e: PlannedExercise) => /^(REC|GOAL|REHAB|RX):/.test(e.key);

/**
 * Muscles an exercise trains, for counting. Rows served at their template slot use the template's
 * labels (which the plan's set rules are written in). Rows that the module added, or that an existing
 * swap replaced, use the exercise tags, because a swap keeps the old row's labels.
 */
export function musclesOf(e: PlannedExercise): GoalMuscle[] {
  const swapped = e.name !== e.originalName && !e.key.startsWith('test:') && e.changes.some((c) => /instead|seated|Spine-sparing|Knee-sparing/.test(c));
  if (isModuleRow(e) || swapped || e.key.startsWith('TRAVEL:')) {
    const t = tagsFor(e.name);
    if (t) return t.primary.filter((m): m is GoalMuscle => (GOAL_MUSCLES as readonly string[]).includes(m));
  }
  return e.muscles.filter((m): m is GoalMuscle => (GOAL_MUSCLES as readonly string[]).includes(m));
}

export type MuscleCount = Partial<Record<GoalMuscle, { sets: number; days: number }>>;

/** Add one session's sets to a running count. `setsOf` decides how many sets each row contributes. */
export function addSession(into: MuscleCount, exercises: PlannedExercise[], setsOf: (e: PlannedExercise) => number = (e) => e.sets): void {
  const seen = new Set<GoalMuscle>();
  for (const e of exercises) {
    if (e.role === 'test') continue;
    const n = setsOf(e);
    if (n <= 0) continue;
    for (const m of musclesOf(e)) {
      const c = (into[m] ??= { sets: 0, days: 0 });
      c.sets += n;
      if (!seen.has(m)) {
        seen.add(m);
        c.days += 1;
      }
    }
  }
}

/** Sets actually done on a past day: ticks, or the served sets when the session was finished without ticking. */
export function performedSets(day: DayRecord | undefined, e: PlannedExercise): number {
  if (!day) return 0;
  const ticked = day.session?.[e.key];
  if (ticked != null) return Math.min(ticked, e.sets);
  return day.sessionDone ? e.sets : 0;
}

export type Core = (input: BuildInput) => SessionPlan;

/** The plan as written for each day of a week: the original builder at Full, travel days as travel. */
export function originalWeek(weekStart: ISODate, data: Data, core: Core): { date: ISODate; session: SessionPlan | null }[] {
  const out: { date: ISODate; session: SessionPlan | null }[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const pos = getPosition(date, data.plan);
    if (pos.status !== 'active') {
      out.push({ date, session: null });
      continue;
    }
    const code = scheduledCode(date, data);
    if (!code) {
      out.push({ date, session: null });
      continue;
    }
    const travel = !!data.days.get(date)?.travelMode;
    out.push({ date, session: core({ date, code, pos, mods: modsForType(travel ? 'Travel' : 'Full'), data }) });
  }
  return out;
}

/** Original weekly sets and days per muscle (the target the rules are measured against). */
export function originalCounts(date: ISODate, data: Data, core: Core): MuscleCount {
  const count: MuscleCount = {};
  for (const d of originalWeek(startOfWeek(date), data, core)) if (d.session) addSession(count, d.session.exercises);
  return count;
}
