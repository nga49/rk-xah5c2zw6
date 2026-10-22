import { useState } from 'react';
import { FileDown, Plus, Trash2 } from 'lucide-react';
import type { Data } from '../../engine/model';
import type { ISODate } from '../../plan/types';
import { toast } from '../../state/hooks';
import { Card, Field, NumInput, Toggle } from '../../ui/kit';
import { saveRecord } from '../actions';
import { MOVEMENT_LABEL, MOVEMENTS, type Injury, type Movement, type RxItem } from '../model';
import { downloadReport } from '../report';
import { rxFor, rxId } from '../rx';
import { DateInput, Picks } from './widgets';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Physio prescription for this injury. It replaces the app's generic rehab, and its blocked movements always win. */
export function RxEditor({ data, date, injury }: { data: Data; date: ISODate; injury: Injury }) {
  const rx = rxFor(injury.id, date, data);
  const [items, setItems] = useState<RxItem[]>(rx?.items ?? []);
  const [by, setBy] = useState(rx?.by ?? '');
  const [restrictions, setRestrictions] = useState(rx?.restrictions ?? '');
  const [blocked, setBlocked] = useState<Movement[]>(rx?.blocked ?? []);
  const [until, setUntil] = useState<ISODate | undefined>(rx?.until);
  const patch = (i: number, p: Partial<RxItem>) => setItems(items.map((it, k) => (k === i ? { ...it, ...p } : it)));
  const save = async () => {
    const clean = items.filter((it) => it.name.trim()).map((it) => ({ ...it, name: it.name.trim(), sets: Math.max(1, Math.round(it.sets || 1)) }));
    await saveRecord<'rx'>({ id: rxId(injury.id), kind: 'rx', injuryId: injury.id, date: rx?.date ?? date, items: clean, by: by.trim() || undefined, restrictions: restrictions.trim() || undefined, blocked: blocked.length ? blocked : undefined, until });
    toast(clean.length ? 'Prescription saved: it replaces the app rehab' : 'Prescription saved');
  };
  return (
    <Card>
      <div className="label">Physio prescription</div>
      <div className="small muted" style={{ marginTop: 4 }}>Exercises from your physio show up in your sessions and replace the app's rehab for this area.</div>
      <div className="stack" style={{ marginTop: 10 }}>
        {items.map((it, i) => (
          <div key={i} className="stack tight" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
            <div className="row" style={{ gap: 8 }}>
              <input className="input grow" value={it.name} placeholder="Exercise" aria-label={`Exercise ${i + 1}`} onChange={(e) => patch(i, { name: e.target.value })} />
              <button className="icon-btn" aria-label={`Remove exercise ${i + 1}`} onClick={() => setItems(items.filter((_, k) => k !== i))}><Trash2 size={18} /></button>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <div className="grow"><Field label="Sets"><NumInput value={it.sets} onChange={(v) => patch(i, { sets: v ?? 1 })} label="Sets" min={1} /></Field></div>
              <div className="grow"><Field label="Reps"><input className="input" value={it.reps ?? ''} onChange={(e) => patch(i, { reps: e.target.value || undefined })} aria-label="Reps" /></Field></div>
              <div className="grow"><Field label="Hold"><NumInput value={it.holdS} onChange={(v) => patch(i, { holdS: v })} unit="s" label="Hold seconds" min={0} /></Field></div>
            </div>
            <Toggle on={!!it.perSide} onChange={(v) => patch(i, { perSide: v || undefined })} label="Per side" />
            <Field group label="Days (none ticked: every day)">
              <Picks label="Days" tone="frost" value={(it.days ?? []).map(String)} onChange={(v) => patch(i, { days: v.map(Number).sort() })} options={DAYS.map((d, k) => ({ value: String(k), label: d }))} />
            </Field>
            <input className="input" value={it.note ?? ''} placeholder="Note from your physio" aria-label="Note" onChange={(e) => patch(i, { note: e.target.value || undefined })} />
          </div>
        ))}
        <button className="btn block" onClick={() => setItems([...items, { name: '', sets: 3 }])}><Plus size={16} /> Add exercise</button>
        <Field label="Prescribed by"><input className="input" value={by} onChange={(e) => setBy(e.target.value)} placeholder="Name or clinic" /></Field>
        <Field label="Restrictions"><textarea className="input" rows={2} value={restrictions} onChange={(e) => setRestrictions(e.target.value)} /></Field>
        <Field group label="Blocked movements (always win over the app)">
          <Picks label="Physio blocked movements" tone="ember" value={blocked} onChange={setBlocked} options={MOVEMENTS.map((m) => ({ value: m, label: MOVEMENT_LABEL[m] }))} />
        </Field>
        <DateInput label="Until (optional)" value={until} onChange={setUntil} />
        <button className="btn primary block" onClick={() => void save()}>Save prescription</button>
      </div>
    </Card>
  );
}

/** One tap: a clean PDF for a doctor or physio, made on this phone. */
export function ReportButton({ data, date, injury }: { data: Data; date: ISODate; injury: Injury }) {
  return (
    <button className="btn block" onClick={() => downloadReport(injury, date, data)}>
      <FileDown size={16} /> Clinician report (PDF)
    </button>
  );
}
