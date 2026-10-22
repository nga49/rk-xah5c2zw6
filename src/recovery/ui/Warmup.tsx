import { Flame } from 'lucide-react';
import type { Data } from '../../engine/model';
import type { PlannedExercise } from '../../engine/session';
import { unitsOf } from '../../engine/units';
import type { ISODate } from '../../plan/types';
import { Fold, Tick } from '../../ui/kit';
import { saveRecord } from '../actions';
import type { WarmupSet } from '../model';
import { rampCheck, suggestRamp, warmupFor, warmupId, WARMUP } from '../prevention';

/** Warm-up ramp for a main lift on Train: suggested sets to tick, and a gentle warning if skipped. */
export function WarmupRamp({ data, date, ex }: { data: Data; date: ISODate; ex: PlannedExercise }) {
  const u = unitsOf(data.profile);
  const work = ex.load?.kg;
  if (ex.role !== 'main' || work == null || (!ex.load?.added && work < WARMUP.minKg)) return null;
  const saved = warmupFor(date, ex.name, data);
  const sets: WarmupSet[] = saved && saved.workKg === work ? saved.sets : suggestRamp(work, ex.equipment, u, ex.load?.added);
  if (!sets.length) return null;
  const started = (data.days.get(date)?.session?.[ex.key] ?? 0) > 0 || data.weights.some((w) => !w.deleted && w.date === date && w.exercise === ex.name);
  const check = rampCheck(saved, work, started);
  const toggle = (i: number, on: boolean) => {
    const next = sets.map((s, k) => (k === i ? { ...s, done: on } : s));
    void saveRecord<'warmup'>({ id: warmupId(date, ex.name), kind: 'warmup', date, exercise: ex.name, workKg: work, sets: next });
  };
  const doneN = sets.filter((s) => s.done).length;
  return (
    <Fold title={<span className="row" style={{ gap: 6 }}><Flame size={14} style={{ color: 'var(--ember)' }} /> Warm-up ramp {doneN ? `· ${doneN}/${sets.length}` : ''}</span>}>
      <div className="stack tight">
        {sets.map((s, i) => (
          <div key={i} className="row" style={{ gap: 10 }}>
            <Tick on={!!s.done} label={`Warm-up set ${i + 1}`} tone="ember" onChange={(on) => toggle(i, on)} />
            <span className="num">{s.kg === 0 ? 'Bodyweight' : ex.load?.added ? `+${u.w(s.kg)}` : u.w(s.kg)}</span>
            <span className="muted small">× {s.reps}</span>
          </div>
        ))}
        {check && <div className="small" style={{ color: `var(--${check.tone})` }}>{check.text}</div>}
        <div className="tiny muted">Easy reps, short rests. A common coaching ramp, not a fixed rule.</div>
      </div>
    </Fold>
  );
}
