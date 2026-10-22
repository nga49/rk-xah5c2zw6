// Day adapter: keeps the badge, tasks, test tasks, the swap card and insights consistent with the
// adjusted session. Returns null when the module is off or nothing is active, so computeDay is unchanged.
import type { Insight } from '../engine/insights';
import type { Data } from '../engine/model';
import type { Decision } from '../engine/readiness';
import type { SwapOffer } from '../engine/schedule';
import type { SessionPlan } from '../engine/session';
import type { Task } from '../engine/tasks';
import type { ISODate, LiftKey, SessionCode } from '../plan/types';
import { activeInjuries, checkedInToday, injuryName, type ActiveInjury } from './state';

export interface RecoveryDay {
  decision(d: Decision, code: SessionCode | null): Decision;
  offer(o: SwapOffer | null): SwapOffer | null;
  tests<T extends { lift: LiftKey }>(t: T[]): T[];
  tasks(t: { training: Task[]; mind: Task[] }, plan: SessionPlan): { training: Task[]; mind: Task[] };
  insights(list: Insight[]): Insight[];
}

/** Daily injury check-in, offered right after the readiness check-in while an injury is active. */
function checkinTasks(active: ActiveInjury[], date: ISODate): Task[] {
  return active.map((a) => {
    const done = checkedInToday(a, date);
    return {
      id: `rec:checkin:${a.injury.id}`,
      label: `Injury check-in · ${injuryName(a.injury)}`,
      group: 'training',
      tone: 'ember',
      done,
      progress: done ? 1 : 0,
      sub: '30 seconds: pain, swelling, confidence',
      link: `#/recover/checkin/${a.injury.id}`,
      auto: true,
    } satisfies Task;
  });
}

function insertAfterCheckin(list: Task[], extra: Task[]): Task[] {
  const i = list.findIndex((t) => t.id === 'checkin');
  return i === -1 ? [...extra, ...list] : [...list.slice(0, i + 1), ...extra, ...list.slice(i + 1)];
}

export function recoveryDay(date: ISODate, data: Data): RecoveryDay | null {
  const r = data.recovery;
  if (!r) return null;
  const active = activeInjuries(date, data);
  if (!active.length) return null;
  const prompt = r.settings.checkinPrompt !== 'off';
  return {
    decision: (d) => d,
    offer: (o) => o,
    tests: (t) => t,
    tasks: (t) => (prompt ? { ...t, training: insertAfterCheckin(t.training, checkinTasks(active, date)) } : t),
    insights: (list) => list,
  };
}
