// The only places the module draws inside existing screens. Each returns nothing while the module is off.
import type { Data } from '../../engine/model';
import type { DayView } from '../../engine/today';
import type { ISODate } from '../../plan/types';
import { SlotBoundary } from './Boundary';
import { InjuryBanner } from './Banner';
import { GoalCard, GoalWeek } from './Goal';
import { ReviewRecovery } from './Review';
import { WarmupRamp } from './Warmup';
import type { PlannedExercise } from '../../engine/session';

export function RecoveryTodaySlot({ data, view, place }: { data: Data; view: DayView; place: 'goal' | 'banner' }) {
  if (!data.recovery) return null;
  if (place === 'banner') {
    return (
      <SlotBoundary label="Injury banner">
        <InjuryBanner data={data} view={view} />
      </SlotBoundary>
    );
  }
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
      <ReviewRecovery data={data} date={date} />
    </SlotBoundary>
  );
}

export function RecoveryTrainSlot({ data, date, ex }: { data: Data; date: ISODate; ex: PlannedExercise }) {
  if (!data.recovery || ex.role !== 'main') return null;
  return (
    <SlotBoundary label="Warm-up">
      <WarmupRamp data={data} date={date} ex={ex} />
    </SlotBoundary>
  );
}
