// Every rule the adaptation engine uses, with where it comes from. Evidence levels:
// 'partly' = a published model exists and the app's rule is stricter or adapted from it;
// 'plan-rule' = the owner's own training rule; 'heuristic' = coaching judgement, no validated number;
// 'unverified' = a planning number not checked against a primary source. Keep these conservative.
import type { Phase } from './model';

export type Evidence = 'partly' | 'plan-rule' | 'heuristic' | 'unverified';
export interface RuleSource {
  source: string;
  evidence: Evidence;
}

/**
 * Pain-monitoring rule for the injured area: progress while pain during exercise stays at or below
 * about 3/10, the next morning is no worse, and there is no week-on-week rise; otherwise step back.
 * Source: pain-monitoring model, Silbernagel KG et al., Am J Sports Med 2007;35(6):897-906 (PMID 17307888),
 * after Thomee 1997. That model allows about 5/10 and was studied in Achilles tendinopathy, so this rule is
 * stricter. Nearest muscle-strain evidence: Hickey JT et al., JOSPT 2020;50(2):91-103 (pain-threshold
 * rehab, similar return times). The week-on-week condition is an added safeguard.
 */
export const PAIN_RULE = { sessionMax: 3, source: 'Silbernagel 2007 pain-monitoring model (stricter); Hickey 2020', evidence: 'partly' } as const;

/**
 * Protect phase lasts at least 3 days: the conservative end of "protect for 1 to 3 days".
 * Source: PEACE & LOVE, Dubois B and Esculier JF, Br J Sports Med 2020.
 */
export const PROTECT_FLOOR_DAYS = { days: 3, source: 'PEACE & LOVE, Br J Sports Med 2020', evidence: 'partly' } as const;

/** Day floors and symptom thresholds for each suggested step up. HEURISTIC: no validated numbers. */
export const STEP_UP = {
  toLoad: { restWalkMax: 2, checkins: 2 },
  toBuild: { days: 7, passing: 3 },
  toReturn: { days: 14, confidence: 3 },
  toCleared: { confidence: 4 },
  source: 'Coaching heuristic; criteria-based return per van der Horst 2017 Delphi and Ardern 2016 Bern consensus',
  evidence: 'heuristic',
} as const;

/** Two failed pain checks within 7 days send the area back to Protect. HEURISTIC. */
export const FAILURES_TO_PROTECT = { count: 2, days: 7, source: 'Coaching heuristic', evidence: 'heuristic' } as const;

/**
 * Re-entry ramp for main lifts that load the injured area: 50, 60, 70, 80, 90, 100% of the last
 * working weight before the injury, one step per session that passes the pain rule.
 * HEURISTIC: no validated re-entry ramp exists (detraining review: Mujika I and Padilla S, 2000).
 */
export const RAMP = { steps: [0.5, 0.6, 0.7, 0.8, 0.9, 1], rir: '3', source: 'Coaching heuristic (no validated ramp)', evidence: 'heuristic' } as const;

/**
 * Goal Guardian redistribution caps. HEURISTIC: no validated dose-response numbers.
 * At most min(8, sets removed) a day, 3 new exercises of 2 to 3 sets, +3 sets a week above the plan
 * for each priority muscle, never closer than 2 reps from failure.
 */
export const FILL = { perDayMax: 8, newRowsMax: 3, setsMin: 2, setsMax: 3, bonusPerMuscle: 3, rir: '2', source: 'Coaching heuristic', evidence: 'heuristic' } as const;

/**
 * Rough planning ranges, in weeks, for how long an injured area stays out of normal training.
 * UNVERIFIED: wide, conservative planning numbers, not checked against a primary source. Published
 * cohort figures come mostly from elite football; individual times vary a lot. They never unlock a
 * phase; they only widen the goal date range. Unknown grade or type uses the longer range.
 */
export const PLANNING_WEEKS = {
  muscle: { 1: [1, 3], 2: [3, 8], 3: [8, 16], unknown: [2, 8] },
  tendon: [6, 16],
  ligament: [2, 12],
  joint: [2, 12],
  nerve: [2, 12],
  bone: [6, 16],
  'post-surgery': [8, 26],
  unknown: [3, 12],
  source: 'Unverified planning range',
  evidence: 'unverified',
} as const;

export const PHASE_ORDER: Phase[] = ['protect', 'load', 'build', 'return'];
export const phaseIndex = (p: Phase) => PHASE_ORDER.indexOf(p);
export const minPhase = (a: Phase, b: Phase): Phase => (phaseIndex(a) <= phaseIndex(b) ? a : b);
export const stepDown = (p: Phase): Phase => PHASE_ORDER[Math.max(0, phaseIndex(p) - 1)];

/** All exported rule constants, for the source test. */
export const RULES: Record<string, RuleSource> = { PAIN_RULE, PROTECT_FLOOR_DAYS, STEP_UP, FAILURES_TO_PROTECT, RAMP, FILL, PLANNING_WEEKS };
