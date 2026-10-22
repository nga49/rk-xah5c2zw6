// What the injury and wellness side tells the Goal Guardian: paused muscles and lifts, suspended
// floors, open red flags. Filled in by the adaptation engine; empty when nothing is active.
import type { Data } from '../engine/model';
import type { ISODate, LiftKey } from '../plan/types';
import type { GoalMuscle } from './volume';

export interface GoalSignals {
  /** Muscles with every row blocked, and why. Reported as paused, never scored as a failure. */
  pausedMuscles: Map<GoalMuscle, string>;
  pausedLifts: Map<LiftKey, string>;
  /** Set-floor rules are suspended (red flag, recovery block, fatigue), with the reason. */
  suspended: string | null;
  /** An open red flag: medical care first. */
  redFlag: string | null;
  /** Choices that trade short-term progress for health, said plainly. */
  tradeoffs: string[];
  /** Weeks the injured area is expected to stay out, as a range, while a goal lift is paused. */
  injuryWeeks: [number, number] | null;
  /** Prevention prompts: load jumps, skipped warm-ups. Prompts to review, never predictions. */
  prevention: string[];
}

export const noSignals = (): GoalSignals => ({ pausedMuscles: new Map(), pausedLifts: new Map(), suspended: null, redFlag: null, tradeoffs: [], injuryWeeks: null, prevention: [] });

type Provider = (date: ISODate, data: Data) => GoalSignals;
let provider: Provider = () => noSignals();

/** The engine registers itself here, so the Guardian never imports engine internals directly. */
export function provideSignals(fn: Provider): void {
  provider = fn;
}

export const goalSignals = (date: ISODate, data: Data): GoalSignals => (data.recovery ? provider(date, data) : noSignals());
