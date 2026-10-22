import { Bandage, ChevronRight, HeartPulse } from 'lucide-react';
import type { Data } from '../../engine/model';
import type { DayView } from '../../engine/today';
import { go } from '../../state/hooks';
import { Card } from '../../ui/kit';
import { constraintsOn } from '../constraints';
import { PHASE_WORD, type Phase } from '../model';
import { checkedInToday } from '../state';
import { FATIGUE_WORD, fatigueOn } from '../wellness';

export const PHASE_MEANING: Record<Phase | 'stop', string> = {
  protect: 'Calm it down: no load on the area, walking as tolerated, pain-free movement only.',
  load: 'Rebuild tolerance: holds, then light work, while pain stays at 3/10 or less.',
  build: 'Restore strength: loading builds back toward your usual exercises.',
  return: 'Back to the plan: main lifts ramp up from reduced loads.',
  stop: 'Red flag: seek medical care before loading it again.',
};

/** What the module changed in today's session, in one line. */
export function changedToday(view: DayView): string {
  const s = view.session;
  const protectedN = s.skipped.filter((x) => /^(Protected|Red flag|Clinician|Physio)/.test(x.why)).length;
  const easier = s.exercises.filter((e) => e.key.startsWith('REC:')).length;
  const goalSets = s.exercises.filter((e) => e.key.startsWith('GOAL:')).reduce((n, e) => n + e.sets, 0) + s.exercises.filter((e) => e.changes.some((c) => c.startsWith('+1 set for the goal'))).length;
  const rehab = s.exercises.filter((e) => e.key.startsWith('REHAB:')).length;
  const ramp = s.exercises.filter((e) => e.changes.some((c) => c.startsWith('Return ramp'))).length;
  const parts: string[] = [];
  if (s.title === 'Paused') return 'Training paused today.';
  if (!view.code) return 'Rest day: walk only if it feels fine.';
  if (protectedN) parts.push(`${protectedN} exercise${protectedN === 1 ? '' : 's'} protected`);
  if (easier) parts.push(`${easier} easier version${easier === 1 ? '' : 's'}`);
  if (goalSets) parts.push(`${goalSets} sets added for the goal, yoke first`);
  if (rehab) parts.push(`${rehab} rehab drill${rehab === 1 ? '' : 's'}`);
  if (ramp) parts.push(`${ramp} lift${ramp === 1 ? '' : 's'} on the return ramp`);
  return parts.length ? `Today: ${parts.join(', ')}.` : 'Today: nothing in this session loads it.';
}

/** Today: the active injury, its phase, what changed today and why. Quick links when nothing is active. */
export function InjuryBanner({ data, view }: { data: Data; view: DayView }) {
  const ctx = constraintsOn(view.date, data);
  const f = data.recovery?.wellness.length ? fatigueOn(view.date, data) : null;
  const areas = ctx?.areas ?? [];
  if (!areas.length && !ctx?.block && (!f || f.level === 'none')) {
    return (
      <div className="row" style={{ gap: 8 }}>
        <button className="btn ghost grow" onClick={() => go('recover/injury/new')}><Bandage size={16} /> Log injury</button>
        <button className="btn ghost grow" onClick={() => go('recover/wellness')}><HeartPulse size={16} /> Wellness</button>
      </div>
    );
  }
  const stop = !!ctx?.stop || areas.some((a) => a.level === 'stop');
  return (
    <Card tone={stop ? 'ember' : 'gold'} toned aria-label="Injury plan today">
      {areas.map((a) => {
        const done = checkedInToday(a.active, view.date);
        return (
          <div key={a.injury.id} className="stack tight" style={{ marginBottom: 10 }}>
            <div className="row between">
              <div className="row" style={{ gap: 8 }}>
                <Bandage size={18} style={{ color: `var(--${a.level === 'stop' ? 'ember' : 'gold'})` }} />
                <span className="label" style={{ color: 'var(--tone)' }}>Injury · {a.level === 'stop' ? 'Red flag' : PHASE_WORD[a.level]}</span>
              </div>
              <button className="link-btn row" style={{ gap: 2 }} onClick={() => go('recover')}>Details <ChevronRight size={14} /></button>
            </div>
            <div style={{ fontWeight: 700 }}>{a.name}</div>
            <div className="small">{changedToday(view)}</div>
            <div className="small muted">{PHASE_MEANING[a.level]}</div>
            {a.level !== 'stop' && a.level !== a.view.confirmed && <div className="small" style={{ color: 'var(--gold)' }}>Stepped back today: {a.view.why[0]}</div>}
            {!done && <button className="btn primary block" style={{ marginTop: 6 }} onClick={() => go(`recover/checkin/${a.injury.id}`)}>Injury check-in · 30 s</button>}
          </div>
        );
      })}
      {ctx?.block && <div className="small">Recovery block: lighter sessions, one more rep in reserve, no tests.</div>}
      {f && f.level !== 'none' && (
        <button className="link-btn row small" style={{ gap: 4, marginTop: 4 }} onClick={() => go('recover/fatigue')}>
          <HeartPulse size={14} /> Wellness: {FATIGUE_WORD[f.level]}. No extra volume while signs add up.
        </button>
      )}
      <div className="tiny muted" style={{ marginTop: 6 }}>Not medical advice. A clinician's restrictions always win.</div>
    </Card>
  );
}
