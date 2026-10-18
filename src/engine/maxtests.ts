import type { ISODate, LiftKey } from '../plan/types';
import { addDays } from './dates';
import type { Data, SessionType } from './model';
import { live } from './model';
import type { Position } from './position';
import { liftForSlot, type TestItem } from './session';

export interface DueTest {
  lift: LiftKey;
  plannedOn: ISODate;
  done: boolean;
}

/** Weekday each lift is tested on: presses Monday, pulls and shrugs Tuesday, squat and hip thrust Thursday. */
const TEST_WEEKDAY = { press: 0, bench: 0, pull: 1, squat: 3, shrug: 1, hipthrust: 3 } as const;

/** Real dates of the current plan week (Monday-aligned unless a pause moved it). */
export function planWeekRange(pos: Position): [ISODate, ISODate] {
  const start = addDays(pos.date, -(pos.dayInBlock % 7));
  return [start, addDays(start, 6)];
}

/** 5.8: reload week of blocks with `test: true`, and W1 of every review block. */
export function isTestWeek(pos: Position): boolean {
  return pos.status === 'active' && pos.weekType.test && !pos.weekType.early;
}

export function dueTests(pos: Position, data: Data): DueTest[] {
  if (!isTestWeek(pos)) return [];
  const [start, end] = planWeekRange(pos);
  const review = pos.block.phase === 'review';
  const lifts: { lift: LiftKey; day: number }[] = [
    { lift: liftForSlot('press', pos, data), day: TEST_WEEKDAY.press },
    { lift: liftForSlot('bench', pos, data), day: TEST_WEEKDAY.bench },
    { lift: liftForSlot('pull', pos, data), day: TEST_WEEKDAY.pull },
    { lift: liftForSlot('squat', pos, data), day: TEST_WEEKDAY.squat },
  ];
  if (review) lifts.push({ lift: 'shrug', day: TEST_WEEKDAY.shrug }, { lift: 'hipthrust', day: TEST_WEEKDAY.hipthrust });
  const tested = live(data.maxes).filter((m) => m.source === 'test' && m.date >= start && m.date <= end);
  return lifts.map(({ lift, day }) => ({ lift, plannedOn: addDays(start, day), done: tested.some((m) => m.lift === lift) }));
}

/** Tests to run today: planned today or earlier this week, not done, and only on a Full day. */
export function testsForToday(pos: Position, data: Data, type: SessionType | null): TestItem[] {
  if (type !== 'Full') return [];
  return dueTests(pos, data)
    .filter((t) => !t.done && t.plannedOn <= pos.date)
    .map((t) => ({ lift: t.lift, plannedOn: t.plannedOn }));
}
