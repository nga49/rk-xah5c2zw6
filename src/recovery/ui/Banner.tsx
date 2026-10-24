import { Bandage, ChevronRight, HeartPulse } from 'lucide-react';
import type { Data } from '../../engine/model';
import type { DayView } from '../../engine/today';
import { go } from '../../state/hooks';
import { Card } from '../../ui/kit';
import { constraintsOn, type AreaRule } from '../constraints';
import { PHASE_WORD } from '../model';
import { canTrain, changes, nextStep } from '../plain';
import { goalSignals } from '../signals';
import { checkedInToday } from '../state';
import { FATIGUE_WORD, fatigueOn } from '../wellness';
import { FlagBox } from './Parts';

export { PHASE_MEANING } from '../plain';

/** Kept for the weekly review and tests: what the module changed today, in one line. */
export function changedToday(view: DayView): string {
  const c = changes(view);
  if (view.session.title === 'Paused') return 'Training paused today.';
  if (!view.code) return 'Rest day: walk only if it feels fine.';
  return c.length ? `Today: ${c.join(' ')}` : 'Today: nothing in this session loads it.';
}

function goalImpact(data: Data, view: DayView): string | null {
  const sig = goalSignals(view.date, data);
  const paused = [...sig.pausedMuscles.keys()];
  if (!paused.length && !sig.redFlag) return null;
  const parts = [paused.length ? `${paused.join(', ')} rest this week; everything else keeps building` : 'Get the warning sign checked first'];
  if (sig.injuryWeeks) parts.push(`the goal date may slip by up to about ${sig.injuryWeeks[1]} weeks (rough estimate)`);
  return `Goal impact: ${parts.join('; ')}.`;
}

function AreaBlock({ a, data, view }: { a: AreaRule; data: Data; view: DayView }) {
  const done = checkedInToday(a.active, view.date);
  const next = nextStep(a, view.date);
  return (
    <div className="stack tight">
      <div className="row between">
        <div className="row" style={{ gap: 8 }}>
          <Bandage size={18} style={{ color: `var(--${a.level === 'stop' ? 'ember' : 'gold'})` }} />
          <span className="label" style={{ color: 'var(--tone)' }}>Injury · {a.level === 'stop' ? 'Warning sign' : PHASE_WORD[a.level]}</span>
        </div>
        <button className="link-btn row" style={{ gap: 2 }} onClick={() => go('recover')}>Details <ChevronRight size={14} /></button>
      </div>
      <div style={{ fontWeight: 700 }}>{a.name} <span className="muted" style={{ fontWeight: 500 }}>· day {a.active.day + 1}</span></div>
      <FlagBox area={a} date={view.date} data={data} />
      {!done && (
        <button className="btn primary block" style={{ marginTop: 6 }} onClick={() => go(`recover/checkin/${a.injury.id}`)}>
          Morning check-in · 30 s
        </button>
      )}
      <div className="small" style={{ marginTop: 4 }}>
        <span style={{ fontWeight: 700 }}>{next.title}.</span> <span className="muted">{next.needs.find((n) => !n.met)?.text ?? ''}</span>
      </div>
    </div>
  );
}

/** Today: can I train, what changed, what comes next, what it does to the goal. Quick links when nothing is active. */
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
  const train = canTrain(view, ctx);
  const lines = changes(view);
  const impact = goalImpact(data, view);
  const stop = !!ctx?.stop || areas.some((a) => a.level === 'stop');
  return (
    <Card tone={stop ? 'ember' : 'gold'} toned aria-label="Injury plan today">
      <div style={{ fontWeight: 700, fontSize: 17, color: `var(--${train.tone})` }}>{train.text}</div>
      {lines.length > 0 && <ul className="small steps-list">{lines.map((l) => <li key={l}>{l}</li>)}</ul>}
      {areas.map((a) => (
        <div key={a.injury.id} style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
          <AreaBlock a={a} data={data} view={view} />
        </div>
      ))}
      {ctx?.block && <div className="small" style={{ marginTop: 8 }}>Recovery block: lighter sessions, one more rep in reserve, no tests.</div>}
      {f && f.level !== 'none' && (
        <button className="link-btn row small" style={{ gap: 4, marginTop: 4 }} onClick={() => go('recover/fatigue')}>
          <HeartPulse size={14} /> Wellness: {FATIGUE_WORD[f.level]}. No extra volume while signs add up.
        </button>
      )}
      {impact && <div className="small" style={{ marginTop: 8, color: 'var(--gold)' }}>{impact}</div>}
      <div className="tiny muted" style={{ marginTop: 6 }}>Not medical advice. A clinician's restrictions always win.</div>
    </Card>
  );
}
