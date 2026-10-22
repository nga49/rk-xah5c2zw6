import type { Data } from '../../engine/model';
import { addDays, diffDays, formatMedium, startOfWeek } from '../../engine/dates';
import type { ISODate } from '../../plan/types';
import { Card } from '../../ui/kit';
import { constraintsOn } from '../constraints';
import { PHASE_WORD, type RecordOf } from '../model';
import { activeInjuries, injuryName } from '../state';
import { FATIGUE_WORD, fatigueOn, signalsOn } from '../wellness';

const worst = (c: { painRest?: number; painWalk?: number }) => Math.max(c.painRest ?? 0, c.painWalk ?? 0);

/** Sunday review: injuries, recovery flags and blocks this week. Nothing shows when the week had none. */
export function ReviewRecovery({ data, date }: { data: Data; date: ISODate }) {
  const monday = startOfWeek(date);
  const days = [...Array(Math.min(7, diffDays(date, monday) + 1)).keys()].map((i) => addDays(monday, i));
  const injuries = activeInjuries(date, data);
  const areas = constraintsOn(date, data)?.areas ?? [];
  const signDays = data.recovery?.wellness.length ? days.filter((d) => signalsOn(d, data).length > 0).length : 0;
  const f = data.recovery?.wellness.length ? fatigueOn(date, data) : null;
  const blocks = (data.recovery?.records ?? []).filter((r): r is RecordOf<'recoveryBlock'> => r.kind === 'recoveryBlock' && r.date <= date && r.until >= monday);
  if (!injuries.length && !signDays && !blocks.length) return null;
  return (
    <Card>
      <div className="label">Injuries and recovery this week</div>
      {injuries.map((a) => {
        const week = a.checkins.filter((c) => c.date >= monday && c.date <= date);
        const first = week[0];
        const last = week.at(-1);
        const area = areas.find((x) => x.injury.id === a.injury.id);
        const trend = first && last && first !== last ? (worst(last) < worst(first) ? 'easing' : worst(last) > worst(first) ? 'rising' : 'steady') : null;
        return (
          <div key={a.injury.id} className="small" style={{ marginTop: 8 }}>
            <span style={{ fontWeight: 700 }}>{injuryName(a.injury)}</span> · {area?.level === 'stop' ? 'red flag open' : PHASE_WORD[a.phase]} · day {a.day + 1}
            <div className="muted">
              {week.length} check-in{week.length === 1 ? '' : 's'} this week{trend && first && last ? `, pain ${trend} (${worst(first)} to ${worst(last)}/10)` : ''}.
              {area?.view.suggestion ? ` Ready to review: ${area.view.suggestion.to === 'cleared' ? 'full clearance' : PHASE_WORD[area.view.suggestion.to]}.` : ''}
            </div>
          </div>
        );
      })}
      {(signDays > 0 || f) && <div className="small" style={{ marginTop: 8 }}>Wellness: {FATIGUE_WORD[f?.level ?? 'none']}{signDays ? `, signs on ${signDays} of ${days.length} days` : ''}.</div>}
      {blocks.map((b) => <div key={b.id} className="small" style={{ marginTop: 4 }}>Recovery block {formatMedium(b.date)} to {formatMedium(b.until)}: {b.reason}.</div>)}
      <div className="tiny muted" style={{ marginTop: 8 }}>Not medical advice.</div>
    </Card>
  );
}
