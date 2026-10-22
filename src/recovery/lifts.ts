// The main lifts the goal rests on this year. Shared by the Guardian and the engine.
import type { Data } from '../engine/model';
import { getPosition } from '../engine/position';
import { liftForSlot } from '../engine/session';
import type { ISODate, LiftKey } from '../plan/types';

export function goalLiftsOf(date: ISODate, data: Data): LiftKey[] {
  const pos = getPosition(date, data.plan);
  return [...(['press', 'bench', 'pull', 'squat'] as const).map((s) => liftForSlot(s, pos, data)), 'shrug', 'hipthrust'];
}
