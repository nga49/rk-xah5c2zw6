import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Data } from '../../engine/model';
import { addDays } from '../../engine/dates';
import { computeDay } from '../../engine/today';
import { unitsOf } from '../../engine/units';
import type { ISODate } from '../../plan/types';
import { go, toast } from '../../state/hooks';
import { Card, Field, NumInput, Seg, SectionTitle, Toggle } from '../../ui/kit';
import { saveInjury, saveRecord } from '../actions';
import { constraintsOn } from '../constraints';
import { FLAG_LABEL, isLowerLimb, REGION_LABEL, REGIONS, RED_FLAGS, type Felt, type FunctionalTest, type Injury, type RedFlag, type Region, type Side } from '../model';
import { canTrain, changes } from '../plain';
import { activeInjuries } from '../state';
import { SameInjury } from './InjuryForm';
import { NotMedical } from './NotMedical';
import { DateInput, PainSeg, Picks, TriTest } from './widgets';

const STEPS = ['Where', 'What happened', 'How it is now', 'Warning signs', 'What changes'];
const MUSCLE: Region[] = ['quad', 'hamstring', 'calf', 'adductor', 'glute', 'upper-arm', 'chest', 'upper-back', 'forearm'];

/** Log an injury in five short steps. Only the first step is required; details can be added later with Edit. */
export function LogWizard({ data, date }: { data: Data; date: ISODate }) {
  const u = unitsOf(data.profile);
  const [step, setStep] = useState(0);
  const [region, setRegion] = useState<Region | undefined>();
  const [side, setSide] = useState<Side | undefined>();
  const [when, setWhen] = useState<'today' | 'yesterday' | 'earlier'>('today');
  const [earlier, setEarlier] = useState<ISODate | undefined>(addDays(date, -2));
  const [felt, setFelt] = useState<Felt | undefined>();
  const [exercise, setExercise] = useState('');
  const [kg, setKg] = useState<number | undefined>();
  const [tests, setTests] = useState<Partial<Record<FunctionalTest, boolean>>>({});
  const [painRest, setPainRest] = useState<number | undefined>();
  const [swelling, setSwelling] = useState(false);
  const [bruising, setBruising] = useState(false);
  const [lump, setLump] = useState(false);
  const [flags, setFlags] = useState<RedFlag[]>([]);
  const [none, setNone] = useState(false);
  const start = when === 'today' ? date : when === 'yesterday' ? addDays(date, -1) : (earlier ?? date);
  const others = activeInjuries(start, data);
  const lower = !!region && isLowerLimb(region);
  const knee = !!region && ['knee', 'quad', 'hamstring'].includes(region);
  const recent = useMemo(() => {
    const names = new Set<string>();
    for (const d of [date, addDays(date, -1)]) for (const e of computeDay(d, data, new Date(`${d}T08:00:00`)).session.exercises) names.add(e.name.replace(/^3RM test: /, ''));
    return [...names];
  }, [data, date]);

  const draft = (): Omit<Injury, 'id' | 'updatedAt'> => ({
    region: region as Region,
    side: side as Side,
    start,
    kind: 'episode',
    type: 'unknown',
    diagnosis: 'suspected',
    status: 'acute',
    mechanism: felt || exercise || kg != null ? { felt, exercise: exercise.trim() || undefined, kg: kg != null ? u.fromDisplay(kg) : undefined } : undefined,
    atLog: { painRest, swelling: swelling || undefined, bruising: bruising || undefined, lump: lump || undefined, tests: Object.keys(tests).length ? tests : undefined, flags: flags.length ? flags : undefined },
  });

  const preview = useMemo(() => {
    if (step !== 4 || !region || !side || !data.recovery) return null;
    const d: Data = { ...data, recovery: { ...data.recovery, injuries: [...data.recovery.injuries, { id: 'draft', updatedAt: 1, ...draft() }] } };
    // Show today if there is still a session to do, otherwise the next day.
    const today = computeDay(date, d, new Date(`${date}T08:00:00`));
    const day = today.code && !data.days.get(date)?.sessionDone ? date : addDays(date, 1);
    const view = day === date ? today : computeDay(day, d, new Date(`${day}T08:00:00`));
    return { day, view, ctx: constraintsOn(day, d) };
  }, [step, region, side, flags, data, date]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!region || !side) return;
    const saved = await saveInjury(draft());
    await saveRecord<'injuryEvent'>({ kind: 'injuryEvent', injuryId: saved.id, date, event: 'status', status: 'acute', by: 'owner' });
    toast(flags.length ? 'Injury logged. Warning sign: seek medical care.' : 'Injury logged: your plan is adapted');
    go('recover');
  };

  const canNext = step === 0 ? !!region && !!side && !!start : step === 3 ? none || flags.length > 0 : true;
  return (
    <div className="stack">
      <SectionTitle>Log an injury</SectionTitle>
      <div className="small muted">Step {step + 1} of {STEPS.length} · {STEPS[step]}</div>
      <Card>
        {step === 0 && (
          <div className="stack">
            <Field label="Where does it hurt?">
              <select className="input" value={region ?? ''} onChange={(e) => setRegion((e.target.value || undefined) as Region | undefined)} aria-label="Body area">
                <option value="">Choose the area</option>
                {REGIONS.map((r) => <option key={r} value={r}>{REGION_LABEL[r]}</option>)}
              </select>
            </Field>
            <Field group label="Which side?">
              <Seg label="Side" tone="frost" value={side} onChange={setSide} options={[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }, { value: 'both', label: 'Both' }, { value: 'midline', label: 'Middle' }]} />
            </Field>
            <Field group label="When did it happen?">
              <Seg label="When" tone="frost" value={when} onChange={setWhen} options={[{ value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' }, { value: 'earlier', label: 'Earlier' }]} />
            </Field>
            {when === 'earlier' && <DateInput label="Date" value={earlier} onChange={setEarlier} max={date} />}
            <SameInjury others={others} region={region} side={side} />
            <button className="link-btn small" style={{ textAlign: 'left' }} onClick={() => go('recover/injury/full')}>An old injury or a standing restriction? Log it as a long-term limit</button>
          </div>
        )}
        {step === 1 && (
          <div className="stack">
            <div className="small muted">Optional. It helps your clinician and keeps the plan careful.</div>
            <Field group label="What did you feel?">
              <Seg label="What did you feel?" tone="gold" wrap value={felt} onChange={setFelt} options={[{ value: 'snap', label: 'A snap' }, { value: 'pop', label: 'A pop' }, { value: 'gradual', label: 'Came on gradually' }, { value: 'other', label: 'Not sure' }]} />
            </Field>
            <Field label="During which exercise?">
              <input className="input" list="rec-exercises" value={exercise} onChange={(e) => setExercise(e.target.value)} placeholder="Pick or type" />
              <datalist id="rec-exercises">{recent.map((n) => <option key={n} value={n} />)}</datalist>
            </Field>
            <Field label="Weight on the bar"><NumInput value={kg} onChange={setKg} unit={u.label} label="Weight" min={0} /></Field>
          </div>
        )}
        {step === 2 && (
          <div className="stack">
            <div className="small muted">Answer what you can. "Not tried" is fine.</div>
            {lower && <TriTest label="Can you put your full weight on it?" value={tests['full-weight-bearing']} onChange={(v) => setTests({ ...tests, 'full-weight-bearing': v })} />}
            <TriTest label="Can you walk without pain?" value={tests['pain-free-walk']} onChange={(v) => setTests({ ...tests, 'pain-free-walk': v })} />
            {lower && <TriTest label="Lying on your back, can you lift the straight leg?" value={tests['straight-leg-raise']} onChange={(v) => setTests({ ...tests, 'straight-leg-raise': v })} />}
            {knee && <TriTest label="Does the knee straighten fully?" value={tests['full-knee-extension']} onChange={(v) => setTests({ ...tests, 'full-knee-extension': v })} />}
            {!lower && <TriTest label="Can you move it through its full range?" value={tests['full-range']} onChange={(v) => setTests({ ...tests, 'full-range': v })} />}
            <PainSeg label="Pain at rest, right now" value={painRest} onChange={setPainRest} />
            <Toggle on={swelling} onChange={setSwelling} label="Swelling" />
            <Toggle on={bruising} onChange={setBruising} label="Bruising" />
            {region && MUSCLE.includes(region) && <Toggle on={lump} onChange={setLump} label="A dip, gap or lump" sub="Tick it even if you are not sure." />}
          </div>
        )}
        {step === 3 && (
          <div className="stack">
            <div className="small">Any of these? They mean: get it checked by a clinician.</div>
            <button className={none ? 'btn primary block' : 'btn block'} aria-pressed={none} onClick={() => { setNone(true); setFlags([]); }}>None of these</button>
            <Picks label="Warning signs" tone="ember" value={flags} onChange={(v) => { setFlags(v); setNone(false); }} options={RED_FLAGS.filter((f) => f !== 'new-on-existing' || others.length > 0).map((f) => ({ value: f, label: FLAG_LABEL[f] }))} />
          </div>
        )}
        {step === 4 && preview && (
          <div className="stack">
            <div className="label">{preview.day === date ? 'Today' : 'Tomorrow'}</div>
            <div style={{ fontWeight: 700, color: `var(--${canTrain(preview.view, preview.ctx).tone})` }}>{canTrain(preview.view, preview.ctx).text}</div>
            <ul className="small steps-list">{changes(preview.view).map((l) => <li key={l}>{l}</li>)}</ul>
            <div className="label" style={{ marginTop: 6 }}>From now on</div>
            <ul className="small steps-list">
              <li>Each morning, a 30-second check-in (a button on Today).</li>
              <li>The plan keeps running. Only exercises that load the injured area change, and spare sets go to your yoke.</li>
              <li>When your check-ins show it is ready, the app offers the next phase. You confirm with one tap.</li>
              <li>After you see a clinician, add the diagnosis, restrictions or physio exercises with Edit.</li>
            </ul>
          </div>
        )}
      </Card>
      {step === 0 && <NotMedical small />}
      <div className="row" style={{ gap: 8 }}>
        {step > 0 && <button className="btn grow" onClick={() => setStep(step - 1)}><ChevronLeft size={16} /> Back</button>}
        {step < STEPS.length - 1 ? (
          <button className="btn primary grow" disabled={!canNext} onClick={() => setStep(step + 1)}>Next <ChevronRight size={16} /></button>
        ) : (
          <button className="btn primary grow" onClick={() => void save()}>Save injury</button>
        )}
      </div>
      {step === 0 && <button className="link-btn" onClick={() => go('recover')}>Cancel</button>}
    </div>
  );
}
