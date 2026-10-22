// Day adapter: keeps the badge, tasks, test tasks, the swap card and insights consistent with the
// adjusted session. Returns null when the module is off or nothing is active, so computeDay is unchanged.
import type { Insight } from '../engine/insights';
import type { Data } from '../engine/model';
import type { Decision } from '../engine/readiness';
import type { SwapOffer } from '../engine/schedule';
import type { SessionPlan } from '../engine/session';
import type { Task } from '../engine/tasks';
import type { ISODate, LiftKey, SessionCode } from '../plan/types';

export interface RecoveryDay {
  decision(d: Decision, code: SessionCode | null): Decision;
  offer(o: SwapOffer | null): SwapOffer | null;
  tests<T extends { lift: LiftKey }>(t: T[]): T[];
  tasks(t: { training: Task[]; mind: Task[] }, plan: SessionPlan): { training: Task[]; mind: Task[] };
  insights(list: Insight[]): Insight[];
}

export function recoveryDay(_date: ISODate, data: Data): RecoveryDay | null {
  if (!data.recovery) return null;
  return null;
}
