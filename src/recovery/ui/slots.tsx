// The only places the module draws inside existing screens. Each returns nothing while the module is off.
import type { Data } from '../../engine/model';
import type { DayView } from '../../engine/today';
import type { ISODate } from '../../plan/types';
import { SlotBoundary } from './Boundary';
import { GoalCard, GoalWeek } from './Goal';

export function RecoveryTodaySlot({ data, view, place }: { data: Data; view: DayView; place: 'goal' }) {
  if (!data.recovery) return null;
  if (place === 'goal') {
    return (
      <SlotBoundary label="Goal card">
        <GoalCard data={data} date={view.date} />
      </SlotBoundary>
    );
  }
  return null;
}

export function RecoveryReviewSlot({ data, date }: { data: Data; date: ISODate }) {
  if (!data.recovery) return null;
  return (
    <SlotBoundary label="Goal review">
      <GoalWeek data={data} date={date} />
    </SlotBoundary>
  );
}
