import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Camera, Pencil, Trash2 } from 'lucide-react';
import type { ScreenProps } from '../App';
import { db } from '../db/db';
import { newId, patchDay, put, remove } from '../db/store';
import { addDays, formatMedium, formatShort, formatSleep } from '../engine/dates';
import { epley, ffmi, fmtKg, leanMass, round1 } from '../engine/formulas';
import { bodyweightOn } from '../engine/loads';
import type { BfSource, CardioLog, CardioType, Data, MaxLog, Photo } from '../engine/model';
import { CARDIO_TYPES, live } from '../engine/model';
import type { DayView } from '../engine/today';
import { LIFTS, ROTATION } from '../plan';
import { STANDARDS, type StandardKey } from '../plan/content';
import type { ISODate, LiftKey } from '../plan/types';
import { go, toast } from '../state/hooks';
import { Card, Chip, Empty, Field, NumInput, Seg, SectionTitle, cx } from '../ui/kit';
import { CheckinForm } from './parts';

const TABS = [
  { id: 'activity', label: 'Activity' },
  { id: 'sleep', label: 'Sleep' },
  { id: 'max', label: 'Rep max' },
  { id: 'body', label: 'Body' },
  { id: 'standards', label: 'Standards' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export function Log({ data, view, route }: ScreenProps) {
  const tab = (TABS.some((t) => t.id === route[1]) ? route[1] : 'activity') as Tab;
  const due = view.tests.some((t) => !t.done);
  return (
    <div className="stack">
      <div className="seg tabs" role="tablist" aria-label="Log sections">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} aria-pressed={tab === t.id} onClick={() => go(`log/${t.id}`)} style={t.id === 'max' && due ? { color: tab === t.id ? undefined : 'var(--ember)' } : undefined}>
            {t.label}
            {t.id === 'max' && due ? ' ·' : ''}
          </button>
        ))}
      </div>
      {tab === 'activity' && <Activity data={data} today={view.date} />}
      {tab === 'sleep' && <Sleep data={data} today={view.date} />}
      {tab === 'max' && <RepMax data={data} view={view} />}
      {tab === 'body' && <Body data={data} today={view.date} />}
      {tab === 'standards' && <Standards data={data} today={view.date} />}
    </div>
  );
}

function DateField({ value, onChange, max }: { value: ISODate; onChange: (d: ISODate) => void; max: ISODate }) {
  return (
    <Field label="Date">
      <input className="input" type="date" value={value} max={max} onChange={(e) => e.target.value && onChange(e.target.value)} />
    </Field>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit?: () => void; onDelete: () => void }) {
  return (
    <div className="row" style={{ gap: 0 }}>
      {onEdit && (
        <button className="icon-btn" aria-label="Edit" onClick={onEdit}>
          <Pencil size={17} />
        </button>
      )}
      <button
        className="icon-btn"
        aria-label="Delete"
        onClick={() => {
          if (window.confirm('Delete this entry?')) onDelete();
        }}
      >
        <Trash2 size={17} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- activity

function Activity({ data, today }: { data: Data; today: ISODate }) {
  const [date, setDate] = useState(today);
  const day = data.days.get(date);
  const [steps, setSteps] = useState<number | undefined>(day?.steps);
  const [editing, setEditing] = useState<CardioLog | null>(null);
  const [type, setType] = useState<CardioType>('incline walk');
  const [min, setMin] = useState<number | undefined>();
  const [hr, setHr] = useState<number | undefined>();
  const [feel, setFeel] = useState<CardioLog['feel']>('easy');
  const [mob, setMob] = useState<number | undefined>(day?.mobilityMin);
  const list = live(data.cardio).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 40);
  const pickDate = (d: ISODate) => {
    setDate(d);
    setSteps(data.days.get(d)?.steps);
    setMob(data.days.get(d)?.mobilityMin);
  };
  const saveCardio = async () => {
    if (!min) return;
    await put('cardio', { id: editing?.id ?? newId(), date: editing?.date ?? date, type, minutes: min, avgHr: hr, feel });
    toast(editing ? 'Cardio updated' : 'Cardio saved');
    setEditing(null);
    setMin(undefined);
    setHr(undefined);
  };
  return (
    <div className="stack">
      <Card>
        <div className="stack">
          <DateField value={date} onChange={pickDate} max={today} />
          <div className="grid2">
            <Field label="Steps (Garmin)">
              <NumInput value={steps} onChange={setSteps} label="Steps" />
            </Field>
            <Field label="Mobility">
              <NumInput value={mob} onChange={setMob} unit="min" label="Mobility minutes" />
            </Field>
          </div>
          <button className="btn block" onClick={() => void patchDay(date, { steps, mobilityMin: mob }).then(() => toast('Saved'))}>
            Save steps and mobility
          </button>
        </div>
      </Card>
      <SectionTitle>{editing ? 'Edit cardio' : 'Cardio'}</SectionTitle>
      <Card tone="frost" toned>
        <div className="stack">
          <Field label="Type">
            <select className="input" value={type} onChange={(e) => setType(e.target.value as CardioType)}>
              {CARDIO_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <div className="grid2">
            <Field label="Minutes"><NumInput value={min} onChange={setMin} unit="min" label="Minutes" /></Field>
            <Field label="Avg HR (optional)"><NumInput value={hr} onChange={setHr} unit="bpm" label="Average heart rate" /></Field>
          </div>
          <Field group label="Felt">
            <Seg label="Felt" tone="frost" value={feel} onChange={setFeel} options={[{ value: 'easy', label: 'Easy' }, { value: 'moderate', label: 'Moderate' }, { value: 'hard', label: 'Hard' }]} />
          </Field>
          <button className="btn frost block" disabled={!min} onClick={() => void saveCardio()}>{editing ? 'Update' : `Add for ${formatShort(date)}`}</button>
          {editing && <button className="link-btn" onClick={() => setEditing(null)}>Cancel edit</button>}
        </div>
      </Card>
      <Card>
        {list.length === 0 && <Empty>No cardio yet.</Empty>}
        {list.map((c) => (
          <div key={c.id} className="list-row">
            <div className="grow">
              <div style={{ fontWeight: 600 }}>{c.type} · {c.minutes} min</div>
              <div className="tiny muted">{formatMedium(c.date)} · {c.feel}{c.avgHr ? ` · ${c.avgHr} bpm` : ''}</div>
            </div>
            <RowActions
              onEdit={() => {
                setEditing(c);
                setType(c.type);
                setMin(c.minutes);
                setHr(c.avgHr);
                setFeel(c.feel);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onDelete={() => void remove('cardio', c.id)}
            />
          </div>
        ))}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- sleep

function Sleep({ data, today }: { data: Data; today: ISODate }) {
  const [date, setDate] = useState(addDays(today, 0));
  const c = data.days.get(date)?.checkin;
  const nights = Array.from({ length: 21 }, (_, i) => addDays(today, -i)).map((d) => ({ d, c: data.days.get(d)?.checkin })).filter((x) => x.c);
  return (
    <div className="stack">
      <Card>
        <div className="stack">
          <DateField value={date} onChange={setDate} max={today} />
          <div className="small muted">{c ? 'Edit that morning’s check-in.' : 'No check-in that day. Add one.'}</div>
          <CheckinForm key={date + (c ? 'c' : 'n')} date={date} initial={c} />
        </div>
      </Card>
      <SectionTitle>Last 3 weeks</SectionTitle>
      <Card>
        {nights.length === 0 && <Empty>No sleep logged yet.</Empty>}
        {nights.map(({ d, c: n }) => (
          <div key={d} className="list-row">
            <div className="grow">
              <div style={{ fontWeight: 600 }}>{formatSleep(n!.sleepMin)} · score {n!.sleepScore}</div>
              <div className="tiny muted">{formatMedium(d)}</div>
            </div>
            <Chip tone={n!.sleepMin >= 450 ? 'moss' : n!.sleepMin >= 390 ? 'gold' : 'ember'}>{n!.sleepMin >= 450 ? '7.5 h+' : n!.sleepMin >= 390 ? 'Short' : 'Very short'}</Chip>
            <button className="icon-btn" aria-label="Edit" onClick={() => setDate(d)}><Pencil size={17} /></button>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- rep max

function RepMax({ data, view }: { data: Data; view: DayView }) {
  const slotLifts = (['press', 'bench', 'pull', 'squat'] as const).map((s) => ROTATION[s].years[Math.min(3, view.pos.year - 1)]);
  const options = [...new Set<LiftKey>([...slotLifts, 'hipthrust', 'shrug', ...(Object.keys(LIFTS) as LiftKey[])])];
  const pending = view.tests.filter((t) => !t.done);
  const [editing, setEditing] = useState<MaxLog | null>(null);
  const [lift, setLift] = useState<LiftKey>(pending[0]?.lift ?? slotLifts[0]);
  const [kg, setKg] = useState<number | undefined>();
  const [reps, setReps] = useState<number | undefined>(3);
  const [date, setDate] = useState(view.date);
  const bwDefault = bodyweightOn(date, data) ?? undefined;
  const [bw, setBw] = useState<number | undefined>(bwDefault);
  const isBw = !!LIFTS[lift].bodyweight;
  const e1 = kg != null && reps ? epley(kg + (isBw ? (bw ?? 0) : 0), reps) : null;
  const list = live(data.maxes).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.updatedAt - a.updatedAt));
  const save = async () => {
    if (kg == null || !reps || (isBw && bw == null)) return;
    const total = isBw ? kg + (bw as number) : kg;
    await put('maxes', { id: editing?.id ?? newId(), date, lift, weightKg: kg, reps, bodyweightKg: isBw ? bw : undefined, e1rm: epley(total, reps), source: editing?.source ?? 'test' });
    toast(`e1RM ${fmtKg(round1(epley(total, reps)))} kg saved`);
    setEditing(null);
    setKg(undefined);
  };
  return (
    <div className="stack">
      {pending.length > 0 && (
        <Card tone="ember" tint>
          <div className="label" style={{ color: 'var(--ember)' }}>Due this week</div>
          <div className="chips" style={{ marginTop: 6 }}>
            {pending.map((t) => (
              <button key={t.lift} className="chip t-ember" onClick={() => setLift(t.lift)}>3RM {LIFTS[t.lift].short} · {formatShort(t.plannedOn)}</button>
            ))}
          </div>
          <div className="tiny muted" style={{ marginTop: 6 }}>Only on a Full day. Stop when speed drops, 1 rep in reserve.</div>
        </Card>
      )}
      <Card tone="ember" toned>
        <div className="stack">
          <Field label="Lift">
            <select className="input" value={lift} onChange={(e) => setLift(e.target.value as LiftKey)}>
              {options.map((l) => <option key={l} value={l}>{LIFTS[l].name}</option>)}
            </select>
          </Field>
          <div className="grid2">
            <Field label={isBw ? 'Added load' : 'Weight'}><NumInput value={kg} onChange={setKg} unit="kg" label="Weight" className="num" /></Field>
            <Field label="Reps"><NumInput value={reps} onChange={setReps} label="Reps" className="num" /></Field>
          </div>
          {isBw && <Field label="Bodyweight that day"><NumInput value={bw} onChange={setBw} unit="kg" label="Bodyweight" /></Field>}
          <DateField value={date} onChange={setDate} max={view.date} />
          <div className="row between">
            <span className="muted small">Estimated 1RM</span>
            <span className="num" style={{ fontSize: 24, color: 'var(--ember)' }}>{e1 ? `${fmtKg(round1(e1))} kg` : '·'}</span>
          </div>
          <button className="btn primary block" disabled={kg == null || !reps || (isBw && bw == null)} onClick={() => void save()}>{editing ? 'Update' : 'Save rep max'}</button>
          {editing && <button className="link-btn" onClick={() => setEditing(null)}>Cancel edit</button>}
        </div>
      </Card>
      <Card>
        {list.length === 0 && <Empty>No maxes yet.</Empty>}
        {list.map((m) => (
          <div key={m.id} className="list-row">
            <div className="grow">
              <div style={{ fontWeight: 600 }}>{LIFTS[m.lift].short} · {LIFTS[m.lift].bodyweight ? '+' : ''}{fmtKg(m.weightKg)} kg × {m.reps}</div>
              <div className="tiny muted">{formatMedium(m.date)} · e1RM {fmtKg(round1(m.e1rm))} kg</div>
            </div>
            <Chip tone={m.source === 'test' ? 'moss' : 'gold'}>{m.source === 'test' ? 'Tested' : 'Unverified'}</Chip>
            <RowActions
              onEdit={() => {
                setEditing(m);
                setLift(m.lift);
                setKg(m.weightKg);
                setReps(m.reps);
                setDate(m.date);
                setBw(m.bodyweightKg);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onDelete={() => void remove('maxes', m.id)}
            />
          </div>
        ))}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- body

async function compressImage(file: File, maxSide: number, quality: number): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function Body({ data, today }: { data: Data; today: ISODate }) {
  const [date, setDate] = useState(today);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [w, setW] = useState<number | undefined>();
  const [bf, setBf] = useState<number | undefined>();
  const [src, setSrc] = useState<BfSource>('scale');
  const [waist, setWaist] = useState<number | undefined>();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const list = live(data.body).filter((b) => b.weightKg != null || b.bodyFatPct != null || b.waistCm != null || b.photoIds?.length).sort((a, b) => (a.date < b.date ? 1 : -1));
  const h = data.profile?.heightCm;
  const latest = useMemo(() => {
    for (const b of list) {
      if (b.bodyFatPct == null) continue;
      const weight = b.weightKg ?? list.find((x) => x.date === b.date && x.weightKg != null)?.weightKg;
      if (weight != null) {
        const lean = leanMass(weight, b.bodyFatPct);
        return { date: b.date, lean, ffmi: h ? ffmi(lean, h).normalized : null };
      }
    }
    return null;
  }, [list, h]);
  const addPhoto = async (file: File | undefined) => {
    if (!file) return;
    let dataUrl = await compressImage(file, 1080, 0.8);
    if (dataUrl.length * 0.75 > 150_000) dataUrl = await compressImage(file, 720, 0.6);
    const bytes = Math.round(dataUrl.length * 0.75);
    const p = await put('photos', { id: newId(), date, view: (['front', 'side', 'back'] as const)[photos.length % 3] ?? 'other', dataUrl, bytes });
    setPhotos([...photos, p]);
    toast(bytes > 150_000 ? 'Photo kept on this phone only (too large for the backup)' : 'Photo saved');
  };
  const save = async () => {
    if (w == null && bf == null && waist == null && !photos.length) return;
    const prev = editingId ? await db.body.get(editingId) : undefined;
    await put('body', { ...(prev ?? {}), id: editingId ?? newId(), date, weightKg: w, bodyFatPct: bf, bfSource: bf != null ? src : undefined, waistCm: waist, photoIds: [...(prev?.photoIds ?? []), ...photos.map((p) => p.id)] });
    toast('Saved');
    setEditingId(null);
    setW(undefined);
    setBf(undefined);
    setWaist(undefined);
    setPhotos([]);
  };
  return (
    <div className="stack">
      {latest && (
        <Card tone="moss" toned>
          <div className="row between">
            <div><div className="label">Lean mass</div><div className="num" style={{ fontSize: 26 }}>{round1(latest.lean)} kg</div></div>
            {latest.ffmi != null && <div><div className="label">FFMI (normalised)</div><div className="num" style={{ fontSize: 26 }}>{round1(latest.ffmi)}</div></div>}
          </div>
          <div className="tiny muted" style={{ marginTop: 4 }}>From {formatMedium(latest.date)}. Goal FFMI about 22.</div>
        </Card>
      )}
      <Card tone="gold" toned>
        <div className="stack">
          <DateField value={date} onChange={setDate} max={today} />
          <div className="grid2">
            <Field label="Weight"><NumInput value={w} onChange={setW} unit="kg" label="Weight" /></Field>
            <Field label="Waist at the navel"><NumInput value={waist} onChange={setWaist} unit="cm" label="Waist" /></Field>
          </div>
          <div className="grid2">
            <Field label="Body fat"><NumInput value={bf} onChange={setBf} unit="%" label="Body fat" /></Field>
            <Field group label="Source"><Seg label="Body fat source" tone="gold" value={src} onChange={setSrc} options={[{ value: 'DEXA', label: 'DEXA' }, { value: 'scale', label: 'Scale' }, { value: 'other', label: 'Other' }]} /></Field>
          </div>
          <label className="btn block">
            <Camera size={16} /> Add a progress photo {photos.length ? `(${photos.length})` : ''}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => void addPhoto(e.target.files?.[0])} />
          </label>
          <div className="tiny muted">Photos are shrunk on the phone. Over 150 KB, they stay on this phone only and are not backed up.</div>
          <button className="btn primary block" onClick={() => void save()}>{editingId ? 'Update' : 'Save'}</button>
        </div>
      </Card>
      <Card>
        {list.length === 0 && <Empty>No body entries yet.</Empty>}
        {list.map((b) => (
          <div key={b.id} className="list-row">
            <div className="grow">
              <div style={{ fontWeight: 600 }}>
                {[b.weightKg != null && `${fmtKg(b.weightKg)} kg`, b.bodyFatPct != null && `${b.bodyFatPct}% ${b.bfSource ?? ''}`, b.waistCm != null && `waist ${b.waistCm} cm`, b.photoIds?.length && `${b.photoIds.length} photo${b.photoIds.length > 1 ? 's' : ''}`].filter(Boolean).join(' · ')}
              </div>
              <div className="tiny muted">{formatMedium(b.date)}</div>
            </div>
            <RowActions
              onEdit={() => {
                setEditingId(b.id);
                setDate(b.date);
                setW(b.weightKg);
                setBf(b.bodyFatPct);
                setSrc(b.bfSource ?? 'scale');
                setWaist(b.waistCm);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onDelete={() => void remove('body', b.id)}
            />
          </div>
        ))}
      </Card>
      <PhotoGrid />
    </div>
  );
}

function PhotoGrid() {
  const photos = useLivePhotos();
  if (!photos.length) return null;
  return (
    <section className="section">
      <SectionTitle>Photos</SectionTitle>
      <div className="grid3">
        {photos.slice(0, 18).map((p) => (
          <figure key={p.id} style={{ margin: 0 }}>
            <img src={p.dataUrl} alt={`${p.view} ${p.date}`} style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', borderRadius: 10, border: '1px solid var(--line)' }} />
            <figcaption className="tiny muted center">{formatShort(p.date)}{p.bytes > 150_000 ? ' · phone only' : ''}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function useLivePhotos(): Photo[] {
  return useLiveQuery(async () => (await db.photos.toArray()).filter((p) => !p.deleted).sort((a, b) => (a.date < b.date ? 1 : -1)), [], []) ?? [];
}

// ---------------------------------------------------------------- standards

function Standards({ data, today }: { data: Data; today: ISODate }) {
  const logged = STANDARDS.filter((s) => s.logged);
  const [key, setKey] = useState<StandardKey>('farmer');
  const [value, setValue] = useState<number | undefined>();
  const [date, setDate] = useState(today);
  const [editId, setEditId] = useState<string | null>(null);
  const def = STANDARDS.find((s) => s.key === key)!;
  const list = live(data.standards).sort((a, b) => (a.date < b.date ? 1 : -1));
  return (
    <div className="stack">
      <Card tone="moss" toned>
        <div className="stack">
          <Seg label="Standard" tone="moss" value={key} onChange={setKey} options={logged.map((s) => ({ value: s.key, label: s.key === 'farmer' ? 'Farmer' : s.key === 'neck' ? 'Neck' : 'Zone 2' }))} />
          <div className="small muted">{def.name}. Targets: Y1 {def.y1} · Y2 {def.y2} · Goal {def.goal}.</div>
          <Field label={def.unit}><NumInput value={value} onChange={setValue} unit={def.unit === 'min' ? 'min' : 'kg'} label={def.name} className="num" /></Field>
          <DateField value={date} onChange={setDate} max={today} />
          <button className="btn primary block" disabled={value == null} onClick={() => void put('standards', { id: editId ?? newId(), date, standard: key, value: value as number }).then(() => { toast(editId ? 'Updated' : 'Saved'); setValue(undefined); setEditId(null); })}>{editId ? 'Update' : 'Save'}</button>
        </div>
      </Card>
      <Card>
        {list.length === 0 && <Empty>No standards logged yet.</Empty>}
        {list.map((s) => {
          const d = STANDARDS.find((x) => x.key === s.standard);
          return (
            <div key={s.id} className={cx('list-row')}>
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{d?.name}: {s.value} {d?.unit}</div>
                <div className="tiny muted">{formatMedium(s.date)}</div>
              </div>
              <RowActions
                onEdit={() => {
                  setEditId(s.id);
                  setKey(s.standard);
                  setValue(s.value);
                  setDate(s.date);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onDelete={() => void remove('standards', s.id)}
              />
            </div>
          );
        })}
      </Card>
    </div>
  );
}
