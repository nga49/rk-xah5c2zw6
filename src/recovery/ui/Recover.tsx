import type { ScreenProps } from '../../App';
import { Runes } from '../../ui/kit';
import { NotMedical } from './NotMedical';

/** The module's own screen at #/recover (no extra tab). */
export function Recover(_props: ScreenProps) {
  return (
    <div className="stack">
      <NotMedical />
      <a className="btn block ghost" href="#/today">Back to Today</a>
      <Runes />
    </div>
  );
}
