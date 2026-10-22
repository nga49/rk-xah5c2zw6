import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Data } from '../../engine/model';
import { unitsOf } from '../../engine/units';
import type { ISODate } from '../../plan/types';
import { go, toast } from '../../state/hooks';
import { Card, Field, Fold, NumInput, Seg, SectionTitle, Toggle } from '../../ui/kit';
import { deleteInjury, saveInjury, saveRecord } from '../actions';
import {
  FLAG_LABEL, FUNCTIONAL_TESTS, INJURY_TYPES, MOVEMENT_LABEL, MOVEMENTS, RED_FLAGS, REGION_LABEL, REGIONS, STATUS_LABEL, TEST_LABEL, TYPE_LABEL,
  type Felt, type FunctionalTest, type Injury, type InjuryStatus, type InjuryType, type Movement, type RedFlag, type Region, type Side,
} from '../model';
import { activeInjuries } from '../state';
import { NotMedical } from './NotMedical';
import { DateInput, PainSeg, Picks, TriTest } from './widgets';

type Tests = Partial<Record<FunctionalTest, boolean>>;

/** Full-page form (not a sheet: a tap outside must never lose what was typed). */
export function InjuryForm({ data, date, id }: { data: Data; date: ISODate; id?: string }) {
  const existing = id ? data.recovery?.injuries.find((i) => i.id === id) : undefined;
  const u = unitsOf(data.profile);
  const [region, setRegion] = useState<Region | undefined>(existing?.region);
  const [side, setSide] = useState<Side | undefined>(existing?.side);
  const [start, setStart] = useState<ISODate | undefined>(existing?.start ?? date);
  const [kind, setKind] = useState<'episode' | 'longTerm'>(existing?.kind ?? 'episode');
  const [applyToPlan, setApplyToPlan] = useState(!!existing?.applyToPlan);
  const [location, setLocation] = useState(existing?.location ?? '');
  const [type, setType] = useState<InjuryType>(existing?.type ?? 'unknown');
  const [grade, setGrade] = useState<0 | 1 | 2 | 3>(existing?.grade ?? 0);
  const [diagnosis, setDiagnosis] = useState<'suspected' | 'confirmed'>(existing?.diagnosis ?? 'suspected');
  const [exercise, setExercise] = useState(existing?.mechanism?.exercise ?? '');
  const [kg, setKg] = useState<number | undefined>(existing?.mechanism?.kg != null ? u.show(existing.mechanism.kg) : undefined);
  const [rep, setRep] = useState<number | undefined>(existing?.mechanism?.rep);
  const [felt, setFelt] = useState<Felt | undefined>(existing?.mechanism?.felt);
  const [how, setHow] = useState(existing?.mechanism?.text ?? '');
  const [imaging, setImaging] = useState(existing?.imaging ?? '');
  const [restrictText, setRestrictText] = useState(existing?.restrictions?.text ?? '');
  const [blocked, setBlocked] = useState<Movement[]>(existing?.restrictions?.blocked ?? []);
  const [until, setUntil] = useState<ISODate | undefined>(existing?.restrictions?.until);
  const at = existing?.atLog;
  const [painRest, setPainRest] = useState<number | undefined>(at?.painRest);
  const [painWalk, setPainWalk] = useState<number | undefined>(at?.painWalk);
  const [painLoad, setPainLoad] = useState<number | undefined>(at?.painLoad);
  const [swelling, setSwelling] = useState(!!at?.swelling);
  const [bruising, setBruising] = useState(!!at?.bruising);
  const [lump, setLump] = useState(!!at?.lump);
  const [rom, setRom] = useState<'full' | 'reduced' | 'very-reduced' | undefined>(at?.rom);
  const [tests, setTests] = useState<Tests>(at?.tests ?? {});
  const others = activeInjuries(start ?? date, data).filter((a) => a.injury.id !== id);
  const [flags, setFlags] = useState<RedFlag[]>(at?.flags ?? (!id && others.length ? ['new-on-existing'] : []));
  const [status, setStatus] = useState<InjuryStatus>(existing?.status ?? 'acute');
  const [expected, setExpected] = useState<ISODate | undefined>(existing?.expectedReturn);
  const [otherSide, setOtherSide] = useState(!!existing?.trainOtherSide);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const ready = !!region && !!side && !!start;

  const save = async () => {
    if (!ready) return;
    const row: Omit<Injury, 'updatedAt' | 'id'> & { id?: string } = {
      id: existing?.id,
      region: region as Region,
      side: side as Side,
      start: start as ISODate,
      kind,
      applyToPlan: kind === 'longTerm' ? applyToPlan : undefined,
      location: location.trim() || undefined,
      type,
      grade: grade || undefined,
      diagnosis,
      mechanism: exercise || kg != null || rep != null || felt || how ? { exercise: exercise.trim() || undefined, kg: kg != null ? u.fromDisplay(kg) : undefined, rep, felt, text: how.trim() || undefined } : undefined,
      imaging: imaging.trim() || undefined,
      restrictions: restrictText || blocked.length || until ? { text: restrictText.trim() || undefined, blocked: blocked.length ? blocked : undefined, until } : undefined,
      atLog: { painRest, painWalk, painLoad, swelling: swelling || undefined, bruising: bruising || undefined, lump: lump || undefined, rom, tests: Object.keys(tests).length ? tests : undefined, flags: flags.length ? flags : undefined },
      status,
      expectedReturn: expected,
      trainOtherSide: otherSide || undefined,
      notes: notes.trim() || undefined,
    };
    const saved = await saveInjury(row);
    // A status change is also written to the event log, so history survives merges.
    if (!existing || existing.status !== status) await saveRecord<'injuryEvent'>({ kind: 'injuryEvent', injuryId: saved.id, date, event: 'status', status, by: 'owner' });
    toast(existing ? 'Injury updated' : 'Injury logged');
    go('recover');
  };

  return (
    <div className="stack">
      <SectionTitle>{existing ? 'Edit injury' : 'Log an injury'}</SectionTitle>
      <NotMedical />
      {flags.length > 0 && <div className="banner">Red flag ticked: seek medical care. Training for that area stops until you have been seen.</div>}
      <Card>
        <div className="stack">
          <Field label="Where">
            <select className="input" value={region ?? ''} onChange={(e) => setRegion((e.target.value || undefined) as Region | undefined)} aria-label="Body region">
              <option value="">Choose a body region</option>
              {REGIONS.map((r) => <option key={r} value={r}>{REGION_LABEL[r]}</option>)}
            </select>
          </Field>
          <Field group label="Side">
            <Seg label="Side" tone="frost" value={side} onChange={setSide} options={[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }, { value: 'both', label: 'Both' }, { value: 'midline', label: 'Middle' }]} />
          </Field>
          <DateInput label="Started" value={start} onChange={setStart} max={date} />
          <Field group label="Kind">
            <Seg label="Kind" tone="frost" value={kind} onChange={setKind} options={[{ value: 'episode', label: 'New injury' }, { value: 'longTerm', label: 'Long-term limit' }]} />
          </Field>
          {kind === 'longTerm' && <Toggle on={applyToPlan} onChange={setApplyToPlan} label="Also remove plan exercises" sub="Off: it only limits what the module adds. On: plan exercises that load it are swapped too." />}
          {others.length > 0 && kind === 'episode' && <div className="small" style={{ color: 'var(--ember)' }}>Another injury is still active. A new one on top of it is a red flag: ticked below.</div>}
        </div>
      </Card>

      <Card>
        <Fold title={<span className="label">Details · optional</span>} open={!!existing?.type || !!existing?.location}>
          <div className="stack" style={{ paddingTop: 6 }}>
            <Field label="Exact spot"><input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. upper, inner, near the joint" /></Field>
            <Field label="Type">
              <select className="input" value={type} onChange={(e) => setType(e.target.value as InjuryType)} aria-label="Injury type">
                {INJURY_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            </Field>
            <Field group label="Grade, if a clinician gave one">
              <Seg label="Grade" tone="gold" value={grade} onChange={setGrade} options={[{ value: 0, label: 'Unknown' }, { value: 1, label: '1' }, { value: 2, label: '2' }, { value: 3, label: '3' }]} />
            </Field>
            <Field group label="Diagnosis">
              <Seg label="Diagnosis" tone="frost" value={diagnosis} onChange={setDiagnosis} options={[{ value: 'suspected', label: 'Suspected' }, { value: 'confirmed', label: 'Confirmed by a clinician' }]} />
            </Field>
            <Field group label="Status">
              <Seg label="Status" tone="frost" wrap value={status} onChange={setStatus} options={(Object.keys(STATUS_LABEL) as InjuryStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))} />
            </Field>
            <DateInput label="Expected return (estimate)" value={expected} onChange={setExpected} />
          </div>
        </Fold>
      </Card>

      <Card>
        <Fold title={<span className="label">How it happened · optional</span>} open={!!existing?.mechanism}>
          <div className="stack" style={{ paddingTop: 6 }}>
            <Field label="Exercise"><input className="input" value={exercise} onChange={(e) => setExercise(e.target.value)} /></Field>
            <div className="grid2">
              <Field label="Load"><NumInput value={kg} onChange={setKg} unit={u.label} label="Load" /></Field>
              <Field label="Rep"><NumInput value={rep} onChange={setRep} label="Rep number" /></Field>
            </div>
            <Field group label="What you felt">
              <Seg label="What you felt" tone="gold" value={felt} onChange={setFelt} options={[{ value: 'snap', label: 'Snap' }, { value: 'pop', label: 'Pop' }, { value: 'gradual', label: 'Gradual' }, { value: 'other', label: 'Other' }]} />
            </Field>
            <Field label="In your words"><textarea className="input" rows={2} value={how} onChange={(e) => setHow(e.target.value)} /></Field>
          </div>
        </Fold>
      </Card>

      <Card>
        <Fold title={<span className="label">Symptoms now · optional</span>} open={!!at}>
          <div className="stack" style={{ paddingTop: 6 }}>
            <PainSeg label="Pain at rest" value={painRest} onChange={setPainRest} />
            <PainSeg label="Pain walking" value={painWalk} onChange={setPainWalk} />
            <PainSeg label="Pain under load" value={painLoad} onChange={setPainLoad} />
            <Toggle on={swelling} onChange={setSwelling} label="Swelling" />
            <Toggle on={bruising} onChange={setBruising} label="Bruising" />
            <Toggle on={lump} onChange={setLump} label="A dip or lump" />
            <Field group label="Range of motion">
              <Seg label="Range of motion" tone="frost" value={rom} onChange={setRom} options={[{ value: 'full', label: 'Full' }, { value: 'reduced', label: 'Reduced' }, { value: 'very-reduced', label: 'Very reduced' }]} />
            </Field>
            {FUNCTIONAL_TESTS.map((t) => <TriTest key={t} label={TEST_LABEL[t]} value={tests[t]} onChange={(v) => setTests({ ...tests, [t]: v })} />)}
          </div>
        </Fold>
      </Card>

      <Card>
        <Fold title={<span className="label">Imaging and clinician · optional</span>} open={!!existing?.imaging || !!existing?.restrictions}>
          <div className="stack" style={{ paddingTop: 6 }}>
            <Field label="Imaging results"><textarea className="input" rows={2} value={imaging} onChange={(e) => setImaging(e.target.value)} placeholder="e.g. ultrasound pending" /></Field>
            <Field label="Clinician restrictions"><textarea className="input" rows={2} value={restrictText} onChange={(e) => setRestrictText(e.target.value)} /></Field>
            <Field group label="Blocked movements (always win over the app)">
              <Picks label="Blocked movements" tone="ember" value={blocked} onChange={setBlocked} options={MOVEMENTS.map((m) => ({ value: m, label: MOVEMENT_LABEL[m] }))} />
            </Field>
            <DateInput label="Restrictions until" value={until} onChange={setUntil} />
          </div>
        </Fold>
      </Card>

      <Card tone="ember" toned>
        <div className="label" style={{ marginBottom: 8 }}>Red flags · tick any that apply</div>
        <Picks label="Red flags" tone="ember" value={flags} onChange={setFlags} options={RED_FLAGS.map((f) => ({ value: f, label: FLAG_LABEL[f] }))} />
        <div className="tiny muted" style={{ marginTop: 8 }}>Any red flag: seek medical care. Chest pain or breathlessness: call your emergency number.</div>
      </Card>

      <Card>
        <Toggle on={otherSide} onChange={setOtherSide} label="Train the other side when safe" sub="Only from the Load phase, only if walking is easy. Off by default." />
        <Field label="Notes"><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </Card>

      <button className="btn primary block" disabled={!ready} onClick={() => void save()}>{existing ? 'Save changes' : 'Log injury'}</button>
      {existing && (
        <button className="btn danger block" onClick={() => { if (confirm('Delete this injury entry?')) void deleteInjury(existing.id).then(() => { toast('Injury deleted'); go('recover'); }); }}>
          <Trash2 size={16} /> Delete entry
        </button>
      )}
      <a className="btn block ghost" href="#/recover">Cancel</a>
      <div className="tiny muted">Stored on this phone and in your private backup only. The more you fill in, the more precise the plan; with few fields it stays conservative.</div>
    </div>
  );
}
