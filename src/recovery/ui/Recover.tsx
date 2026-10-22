import type { ScreenProps } from '../../App';
import { Runes } from '../../ui/kit';
import { GoalPanel } from './Goal';
import { NotMedical } from './NotMedical';
import { SlotBoundary } from './Boundary';

/** The module's own screen at #/recover (no extra tab). */
export function Recover({ data, view }: ScreenProps) {
  return (
    <div className="stack">
      <NotMedical />
      <SlotBoundary label="Goal Guardian">
        <GoalPanel data={data} date={view.date} />
      </SlotBoundary>
      <a className="btn block ghost" href="#/today">Back to Today</a>
      <Runes />
    </div>
  );
}
