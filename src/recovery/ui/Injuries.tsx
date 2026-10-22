import { useState } from 'react';
import { Bandage, ChevronRight, Plus } from 'lucide-react';
import type { Data } from '../../engine/model';
import { formatMedium } from '../../engine/dates';
import type { ISODate } from '../../plan/types';
import { go, toast } from '../../state/hooks';
import { Card, Chip, Field, Sheet, SectionTitle, Toggle } from '../../ui/kit';
import { saveInjuryCheckin } from '../actions';
import { FLAG_LABEL, FUNCTIONAL_TESTS, isLowerLimb, PHASE_WORD, RED_FLAGS, STATUS_LABEL, TEST_LABEL, type FunctionalTest, type RedFlag } from '../model';
import { activeInjuries, checkedInToday, injuryName, statusOn, standingLimits } from '../state';
import { PainSeg, Picks, Scale5, TriTest } from './widgets';
import { constraintsOn } from '../constraints';
import { PhaseStep } from './PhaseStep';

/** Recover screen: active injuries, long-term limits and past entries. */
export function InjuryList({ data, date }: { data: Data; date: ISODate }) {
  const active = activeInjuries(date, data);
  const limits = standingLimits(date, data);
  const past = (data.recovery?.injuries ?? []).filter((i) => i.kind !== 'longTerm' && statusOn(i, date, data) === 'cleared');
  const areas = constraintsOn(date, data)?.areas ?? [];
  return (
    <section className="section" aria-label="Injuries">
      <SectionTitle right={<button className="link-btn row" style={{ gap: 2 }} onClick={() => go('recover/injury/new')}><Plus size={14} /> Log</button>}>Injuries</SectionTitle>
      {!active.length && !limits.length && (
        <Card>
          <div className="small muted">No active injury. Log one the day it happens: the plan adapts to it.</div>
          <button className="btn block" style={{ marginTop: 8 }} onClick={() => go('recover/injury/new')}><Bandage size={16} /> Log an injury</button>
        </Card>
      )}
      {active.map((a) => (
        <Card key={a.injury.id} tone={a.flags.length ? 'ember' : 'gold'} toned>
          <div className="row between" style={{ alignItems: 'flex-start' }}>
            <div className="grow">
              <div className="label">Since {formatMedium(a.injury.start)} · day {a.day + 1}</div>
              <div style={{ fontWeight: 700, fontSize: 17, marginTop: 2 }}>{injuryName(a.injury)}{a.injury.location ? <span className="muted" style={{ fontWeight: 500 }}> · {a.injury.location}</span> : null}</div>
            </div>
            <button className="icon-btn" aria-label={`Edit ${injuryName(a.injury)}`} onClick={() => go(`recover/injury/${a.injury.id}`)}><ChevronRight size={20} /></button>
          </div>
          <div className="chips" style={{ marginTop: 8 }}>
            <Chip tone="gold">{PHASE_WORD[a.phase]}</Chip>
            <Chip plain>{STATUS_LABEL[a.status]}</Chip>
            <Chip plain>{a.injury.diagnosis === 'confirmed' ? 'Confirmed' : 'Suspected'}</Chip>
            {a.flags.length > 0 && <Chip tone="ember">Red flag</Chip>}
          </div>
          {a.flags.length > 0 && <div className="small" style={{ color: 'var(--ember)', marginTop: 8 }}>Seek medical care: {a.flags.map((f) => FLAG_LABEL[f]).join('; ')}.</div>}
          {areas.filter((x) => x.injury.id === a.injury.id).map((x) => <PhaseStep key={x.injury.id} area={x} date={date} />)}
          <button className={checkedInToday(a, date) ? 'btn block' : 'btn primary block'} style={{ marginTop: 10 }} onClick={() => go(`recover/checkin/${a.injury.id}`)}>
            {checkedInToday(a, date) ? 'Check-in done · edit' : 'Daily check-in · 30 s'}
          </button>
        </Card>
      ))}
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

/** The 30-second daily check for one injury. Open state comes from the route, not local state. */
export function InjuryCheckinSheet({ data, date, injuryId }: { data: Data; date: ISODate; injuryId: string | undefined }) {
  const a = injuryId ? activeInjuries(date, data).find((x) => x.injury.id === injuryId) : undefined;
  return (
    <Sheet open={!!a} title={a ? `Check-in · ${injuryName(a.injury)}` : 'Check-in'} onClose={() => go('recover')}>
      {a && <CheckinBody key={`${a.injury.id}:${date}`} data={data} date={date} injuryId={a.injury.id} lower={isLowerLimb(a.injury.region)} />}
    </Sheet>
  );
}

function CheckinBody({ data, date, injuryId, lower }: { data: Data; date: ISODate; injuryId: string; lower: boolean }) {
  const prev = data.recovery?.checkins.find((c) => c.injuryId === injuryId && c.date === date);
  const [painRest, setPainRest] = useState<number | undefined>(prev?.painRest);
  const [painWalk, setPainWalk] = useState<number | undefined>(prev?.painWalk);
  const [painSession, setPainSession] = useState<number | undefined>(prev?.painSession);
  const [painMorning, setPainMorning] = useState<number | undefined>(prev?.painMorning);
  const [swelling, setSwelling] = useState(!!prev?.swelling);
  const [confidence, setConfidence] = useState<1 | 2 | 3 | 4 | 5 | undefined>(prev?.confidence);
  const [tests, setTests] = useState<Partial<Record<FunctionalTest, boolean>>>(prev?.tests ?? {});
  const [flags, setFlags] = useState<RedFlag[]>(prev?.flags ?? []);
  const [notes, setNotes] = useState(prev?.notes ?? '');
  const shown = FUNCTIONAL_TESTS.filter((t) => lower || t === 'full-range');
  const save = async () => {
    await saveInjuryCheckin({ injuryId, date, painRest, painWalk, painSession, painMorning, swelling: swelling || undefined, confidence, tests: Object.keys(tests).length ? tests : undefined, flags: flags.length ? flags : undefined, notes: notes.trim() || undefined });
    toast(flags.length ? 'Saved. Red flag: seek medical care.' : 'Check-in saved');
    go('recover');
  };
  return (
    <div className="stack">
      <PainSeg label="Pain this morning" value={painMorning} onChange={setPainMorning} />
      <PainSeg label="Pain at rest" value={painRest} onChange={setPainRest} />
      <PainSeg label="Pain walking" value={painWalk} onChange={setPainWalk} />
      <PainSeg label="Pain in the last session (injured area)" value={painSession} onChange={setPainSession} />
      <Toggle on={swelling} onChange={setSwelling} label="Swelling" />
      <Scale5 label="Confidence in the area" value={confidence} onChange={setConfidence} tone="moss" />
      {shown.map((t) => <TriTest key={t} label={TEST_LABEL[t]} value={tests[t]} onChange={(v) => setTests({ ...tests, [t]: v })} />)}
      <Field group label="Red flags">
        <Picks label="Red flags" tone="ember" value={flags} onChange={setFlags} options={RED_FLAGS.filter((f) => f !== 'new-on-existing').map((f) => ({ value: f, label: FLAG_LABEL[f] }))} />
      </Field>
      <Field label="Notes"><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <button className="btn primary block" onClick={() => void save()}>Save check-in</button>
      <div className="tiny muted">Not medical advice. Chest pain or breathlessness: call your emergency number.</div>
    </div>
  );
}
