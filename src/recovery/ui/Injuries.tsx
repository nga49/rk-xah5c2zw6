import { useState } from 'react';
import { Bandage, Check, ChevronRight, Circle, Plus } from 'lucide-react';
import type { Data } from '../../engine/model';
import { addDays, formatMedium } from '../../engine/dates';
import type { ISODate } from '../../plan/types';
import { go, toast } from '../../state/hooks';
import { Card, Field, Fold, Sheet, SectionTitle, Toggle } from '../../ui/kit';
import { saveInjuryCheckin } from '../actions';
import { constraintsOn, type AreaRule } from '../constraints';
import { FLAG_LABEL, isLowerLimb, RED_FLAGS, TEST_LABEL, type FunctionalTest, type RedFlag } from '../model';
import { nextStep, PHASE_MEANING } from '../plain';
import { activeInjuries, checkedInToday, injuryName, statusOn, standingLimits } from '../state';
import { FlagBox, PhaseTrack } from './Parts';
import { PhaseStep } from './PhaseStep';
import { PainSeg, Picks, Scale5, TriTest } from './widgets';

/** One active injury: where it stands, what to do today, what comes next. */
function InjuryCard({ a, data, date }: { a: AreaRule; data: Data; date: ISODate }) {
  const done = checkedInToday(a.active, date);
  const next = nextStep(a, date);
  return (
    <Card tone={a.level === 'stop' ? 'ember' : 'gold'} toned>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <div style={{ fontWeight: 700, fontSize: 17 }}>{a.name}{a.injury.location ? <span className="muted" style={{ fontWeight: 500 }}> · {a.injury.location}</span> : null}</div>
          <div className="small muted">Since {formatMedium(a.injury.start)} · day {a.active.day + 1} · {a.injury.diagnosis === 'confirmed' ? 'confirmed by a clinician' : 'suspected'}</div>
        </div>
        <button className="link-btn row" style={{ gap: 2 }} aria-label={`Edit ${a.name}`} onClick={() => go(`recover/injury/${a.injury.id}`)}>Edit <ChevronRight size={14} /></button>
      </div>
      <PhaseTrack area={a} />
      <div className="small muted" style={{ marginTop: 6 }}>{PHASE_MEANING[a.level]}</div>
      <FlagBox area={a} date={date} data={data} />
      <button className={done ? 'btn block' : 'btn primary block'} style={{ marginTop: 10 }} onClick={() => go(`recover/checkin/${a.injury.id}`)}>
        {done ? 'Check-in done · edit' : 'Morning check-in · 30 s'}
      </button>
      <div className="small" style={{ marginTop: 10, fontWeight: 700 }}>{next.title}</div>
      {next.needs.length > 0 && (
        <ul className="small steps-list" style={{ listStyle: 'none', paddingLeft: 0 }}>
          {next.needs.map((n) => (
            <li key={n.text} className="row" style={{ gap: 6, alignItems: 'flex-start', color: n.met ? 'var(--moss)' : 'var(--muted)' }}>
              {n.met ? <Check size={14} style={{ flexShrink: 0, marginTop: 3 }} aria-label="Done" /> : <Circle size={12} style={{ flexShrink: 0, marginTop: 4 }} aria-label="To do" />}
              <span>{n.text}</span>
            </li>
          ))}
        </ul>
      )}
      <PhaseStep area={a} date={date} />
    </Card>
  );
}

/** Recover screen: active injuries, long-term limits and past entries. */
export function InjuryList({ data, date }: { data: Data; date: ISODate }) {
  const areas = constraintsOn(date, data)?.areas ?? [];
  const limits = standingLimits(date, data);
  const past = (data.recovery?.injuries ?? []).filter((i) => i.kind !== 'longTerm' && statusOn(i, date, data) === 'cleared');
  return (
    <section className="section" aria-label="Injuries">
      <SectionTitle right={<button className="link-btn row" style={{ gap: 2 }} onClick={() => go('recover/injury/new')}><Plus size={14} /> Log</button>}>Injuries</SectionTitle>
      {!areas.length && !limits.length && (
        <Card>
          <div className="small muted">No active injury. If something happens, log it the same day: it takes a minute and the plan adapts.</div>
          <button className="btn block" style={{ marginTop: 8 }} onClick={() => go('recover/injury/new')}><Bandage size={16} /> Log an injury</button>
        </Card>
      )}
      {areas.map((a) => <InjuryCard key={a.injury.id} a={a} data={data} date={date} />)}
      {limits.length > 0 && (
        <Card>
          <div className="label">Long-term limits</div>
          {limits.map((l) => (
            <button key={l.id} className="list-row" style={{ width: '100%', background: 'none', border: 0, color: 'inherit', textAlign: 'left' }} onClick={() => go(`recover/injury/${l.id}`)}>
              <span className="grow">{injuryName(l)}{l.restrictions?.blocked?.length ? <span className="muted small"> · {l.restrictions.blocked.length} blocked movements</span> : null}</span>
              <ChevronRight size={18} className="muted" />
            </button>
          ))}
        </Card>
      )}
      {past.length > 0 && (
        <Card>
          <div className="label">Cleared</div>
          {past.map((p) => (
            <button key={p.id} className="list-row" style={{ width: '100%', background: 'none', border: 0, color: 'inherit', textAlign: 'left' }} onClick={() => go(`recover/injury/${p.id}`)}>
              <span className="grow">{injuryName(p)} <span className="muted small">· {formatMedium(p.start)}</span></span>
              <ChevronRight size={18} className="muted" />
            </button>
          ))}
        </Card>
      )}
    </section>
  );
}

/** The 30-second morning check for one injury. Open state comes from the route, not local state. */
export function InjuryCheckinSheet({ data, date, injuryId }: { data: Data; date: ISODate; injuryId: string | undefined }) {
  const a = injuryId ? activeInjuries(date, data).find((x) => x.injury.id === injuryId) : undefined;
  return (
    <Sheet open={!!a} title={a ? `Check-in · ${injuryName(a.injury)}` : 'Check-in'} onClose={() => go('recover')}>
      {a && <CheckinBody key={`${a.injury.id}:${date}`} data={data} date={date} injuryId={a.injury.id} lower={isLowerLimb(a.injury.region)} knee={['knee', 'quad', 'hamstring'].includes(a.injury.region)} phase={a.phase} />}
    </Sheet>
  );
}

function CheckinBody({ data, date, injuryId, lower, knee, phase }: { data: Data; date: ISODate; injuryId: string; lower: boolean; knee: boolean; phase: string }) {
  const prev = data.recovery?.checkins.find((c) => c.injuryId === injuryId && c.date === date);
  const trainedYesterday = !!data.days.get(addDays(date, -1))?.sessionDone;
  const [painRest, setPainRest] = useState<number | undefined>(prev?.painRest ?? prev?.painMorning);
  const [painWalk, setPainWalk] = useState<number | undefined>(prev?.painWalk);
  const [painSession, setPainSession] = useState<number | undefined>(prev?.painSession);
  const [swelling, setSwelling] = useState(!!prev?.swelling);
  const [confidence, setConfidence] = useState<1 | 2 | 3 | 4 | 5 | undefined>(prev?.confidence);
  const [tests, setTests] = useState<Partial<Record<FunctionalTest, boolean>>>(prev?.tests ?? {});
  const [flags, setFlags] = useState<RedFlag[]>(prev?.flags ?? []);
  const [notes, setNotes] = useState(prev?.notes ?? '');
  // Only the checks the next step needs; the rest stay under "More checks".
  const key: FunctionalTest[] = lower && phase === 'protect' ? ['full-weight-bearing', 'straight-leg-raise', ...(knee ? ['full-knee-extension' as const] : [])] : [];
  const more: FunctionalTest[] = (['straight-leg-raise', 'full-weight-bearing', 'pain-free-walk', 'full-knee-extension', 'full-range'] as FunctionalTest[]).filter((t) => !key.includes(t) && (lower || t === 'full-range'));
  const save = async () => {
    // A morning check-in: pain at rest this morning is also the morning value the pain rule compares.
    await saveInjuryCheckin({ injuryId, date, painRest, painMorning: painRest, painWalk, painSession, swelling: swelling || undefined, confidence, tests: Object.keys(tests).length ? tests : undefined, flags: flags.length ? flags : undefined, notes: notes.trim() || undefined });
    toast(flags.length ? 'Saved. Warning sign: seek medical care.' : 'Check-in saved');
    go('recover');
  };
  return (
    <div className="stack">
      <div className="small muted">Each morning, before training. Your answers decide when you move to the next phase.</div>
      <PainSeg label="Pain at rest, this morning" value={painRest} onChange={setPainRest} />
      <PainSeg label="Pain when walking" value={painWalk} onChange={setPainWalk} />
      {(trainedYesterday || prev?.painSession != null) && <PainSeg label="Pain in that area during yesterday's training" value={painSession} onChange={setPainSession} />}
      <Toggle on={swelling} onChange={setSwelling} label="Swelling" />
      <Scale5 label="How much do you trust it? (1 not at all, 5 fully)" value={confidence} onChange={setConfidence} tone="moss" />
      {key.map((t) => <TriTest key={t} label={TEST_LABEL[t]} value={tests[t]} onChange={(v) => setTests({ ...tests, [t]: v })} />)}
      {more.length > 0 && (
        <Fold title={<span className="label">More checks · optional</span>} open={more.some((t) => tests[t] != null)}>
          <div className="stack">{more.map((t) => <TriTest key={t} label={TEST_LABEL[t]} value={tests[t]} onChange={(v) => setTests({ ...tests, [t]: v })} />)}</div>
        </Fold>
      )}
      <Fold title={<span className="label">Any warning signs? {flags.length ? `· ${flags.length} ticked` : '· usually none'}</span>} open={flags.length > 0}>
        <Picks label="Warning signs" tone="ember" value={flags} onChange={setFlags} options={RED_FLAGS.map((f) => ({ value: f, label: FLAG_LABEL[f] }))} />
      </Fold>
      <Field label="Notes"><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <button className="btn primary block" onClick={() => void save()}>Save check-in</button>
      <div className="tiny muted">Not medical advice. Chest pain or breathlessness: call your emergency number.</div>
    </div>
  );
}
