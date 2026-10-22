import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Camera, Trash2, Utensils } from 'lucide-react';
import { db } from '../../db/db';
import type { Data } from '../../engine/model';
import { formatMedium } from '../../engine/dates';
import { getPosition } from '../../engine/position';
import type { ISODate } from '../../plan/types';
import { applyAction } from '../../state/actions';
import { toast } from '../../state/hooks';
import { Card, Field, NumInput, Seg, SectionTitle } from '../../ui/kit';
import { deleteLocalPhoto, saveLocalPhoto, saveRecord } from '../actions';
import { currentMode, MODE_WORD, moduleOffset, offsetFor, planMode, proteinId, proteinOn, proteinTarget, proteinWeek, suggestedMode, type Mode } from '../fuel';
import { mindsetId, mindsetOn } from '../mind';
import type { LocalPhoto } from '../model';
import { Scale5 } from './widgets';

/** Recover screen: progress photos (this phone only), the mindset check, protein and the nutrition switch. */
export function MindBodySection({ data, date }: { data: Data; date: ISODate }) {
  return (
    <section className="section" aria-label="Mind and body">
      <SectionTitle>Mind and body</SectionTitle>
      <MindsetCard data={data} date={date} />
      <FuelCard data={data} date={date} />
      <PhotosCard date={date} />
    </section>
  );
}

function MindsetCard({ data, date }: { data: Data; date: ISODate }) {
  const prev = mindsetOn(date, data);
  const today = prev?.date === date ? prev : null;
  const [f, setF] = useState<number | undefined>(today?.frustration);
  const [m, setM] = useState<number | undefined>(today?.motivation);
  const [c, setC] = useState<number | undefined>(today?.confidence);
  const save = async () => {
    if (f == null || m == null || c == null) return;
    await saveRecord<'mindset'>({ id: mindsetId(date), kind: 'mindset', date, frustration: f, motivation: m, confidence: c });
    toast(f >= 4 ? 'Saved. Frustration is normal: the plan protects 2029.' : 'Mindset saved');
  };
  return (
    <Card>
      <div className="label">Mindset check</div>
      <div className="stack" style={{ marginTop: 8 }}>
        <Scale5 label="Frustration (1 calm, 5 very)" value={f} onChange={setF} tone="gold" />
        <Scale5 label="Motivation (1 low, 5 high)" value={m} onChange={setM} tone="moss" />
        <Scale5 label="Confidence in your body (1 low, 5 high)" value={c} onChange={setC} />
        <button className="btn block" disabled={f == null || m == null || c == null} onClick={() => void save()}>Save mindset</button>
      </div>
    </Card>
  );
}

function FuelCard({ data, date }: { data: Data; date: ISODate }) {
  const target = proteinTarget(date, data);
  const eaten = proteinOn(date, data);
  const week = proteinWeek(date, data);
  const mode = currentMode(date, data);
  const plan = planMode(date, data);
  const suggestion = suggestedMode(date, data);
  const [grams, setGrams] = useState<number | undefined>();
  const addProtein = async (g: number) => {
    await saveRecord<'protein'>({ id: proteinId(date), kind: 'protein', date, grams: Math.max(0, eaten + g) });
  };
  const switchMode = async (next: Mode) => {
    if (next === mode) return;
    const needed = offsetFor(next, date, data) - moduleOffset(date, data);
    if (needed) {
      const block = getPosition(date, data.plan).block.code;
      await applyAction({ kind: 'applyKcal', block, offset: needed, sourceId: `rec:mode:${date}:${next}`, reason: `${MODE_WORD[next]} (your choice)` }, date);
    }
    await saveRecord<'nutrition'>({ kind: 'nutrition', date, mode: next, reason: next === plan ? 'back to the plan' : suggestion?.mode === next ? suggestion.why : 'owner choice' });
  };
  return (
    <Card>
      <div className="row" style={{ gap: 8 }}><Utensils size={16} style={{ color: 'var(--ember)' }} /><span className="label">Recovery nutrition</span></div>
      <div className="small" style={{ marginTop: 8 }}>Protein today: <b>{eaten} g</b> of {target.grams} g</div>
      <div className="tiny muted">{target.why}{week.logged ? ` On target ${week.hit} of ${week.logged} logged days this week.` : ''}</div>
      <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {[20, 30, 40].map((g) => <button key={g} className="btn" onClick={() => void addProtein(g)}>+{g} g</button>)}
        <div className="grow" style={{ minWidth: 120 }}><NumInput value={grams} onChange={setGrams} unit="g" label="Protein grams" min={0} /></div>
        <button className="btn" disabled={!grams} onClick={() => void (grams ? saveRecord<'protein'>({ id: proteinId(date), kind: 'protein', date, grams }).then(() => setGrams(undefined)) : null)}>Set</button>
      </div>
      <Field group label={`Calories mode · plan: ${MODE_WORD[plan]}`}>
        <Seg label="Calories mode" tone="gold" value={mode} onChange={(v) => void switchMode(v)} options={(['cut', 'maintenance', 'surplus'] as Mode[]).map((m) => ({ value: m, label: MODE_WORD[m] }))} />
      </Field>
      {suggestion && suggestion.mode !== mode && <div className="small" style={{ color: 'var(--gold)' }}>Suggested: {MODE_WORD[suggestion.mode]}. {suggestion.why} You decide.</div>}
      <div className="tiny muted" style={{ marginTop: 6 }}>
        Against the plan, per day: {(['cut', 'maintenance', 'surplus'] as Mode[]).filter((m) => m !== plan).map((m) => `${MODE_WORD[m].toLowerCase()} ${signed(offsetFor(m, date, data))} kcal`).join(', ')} (approximate). Applied through the usual calorie update; update Yazio to match. Kidney problems: ask a doctor about protein. Not medical advice.
      </div>
    </Card>
  );
}

const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`;

/** Downscale on the phone before saving: photos never leave the device. */
async function shrink(file: File, max = 1080): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = fail;
      i.src = url;
    });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function PhotosCard({ date }: { date: ISODate }) {
  const photos = useLiveQuery(() => db.localPhotos.toArray(), []) ?? [];
  const [view, setView] = useState<LocalPhoto['view']>('front');
  const live = photos.filter((p) => !p.deleted).sort((a, b) => (a.date < b.date ? -1 : 1));
  const mine = live.filter((p) => p.view === view);
  const first = mine[0];
  const last = mine.at(-1);
  const add = async (file: File | undefined) => {
    if (!file) return;
    await saveLocalPhoto(date, view, await shrink(file));
    toast('Photo kept on this phone only');
  };
  return (
    <Card>
      <div className="row" style={{ gap: 8 }}><Camera size={16} style={{ color: 'var(--gold)' }} /><span className="label">Progress photos</span></div>
      <div className="small muted" style={{ marginTop: 4 }}>Stored on this phone only: never backed up, never uploaded. Lose the phone and they are gone.</div>
      <Field group label="View">
        <Seg label="Photo view" tone="frost" value={view} onChange={setView} options={[{ value: 'front', label: 'Front' }, { value: 'side', label: 'Side' }, { value: 'back', label: 'Back' }]} />
      </Field>
      {first && last && (
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          {[first, ...(last.id !== first.id ? [last] : [])].map((p) => (
            <figure key={p.id} style={{ margin: 0, flex: 1 }}>
              <img src={p.dataUrl} alt={`${p.view} on ${formatMedium(p.date)}`} style={{ width: '100%', borderRadius: 8, display: 'block' }} />
              <figcaption className="tiny muted row between" style={{ marginTop: 4 }}>
                {formatMedium(p.date)}
                <button className="icon-btn" aria-label={`Delete photo from ${formatMedium(p.date)}`} onClick={() => void deleteLocalPhoto(p.id)}><Trash2 size={16} /></button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      <label className="btn block" style={{ marginTop: 10 }}>
        <Camera size={16} /> Add a {view} photo
        <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => void add(e.target.files?.[0])} />
      </label>
    </Card>
  );
}
