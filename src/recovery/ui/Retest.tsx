import { useState } from 'react';
import { Target } from 'lucide-react';
import type { Data } from '../../engine/model';
import { bodyweightOn } from '../../engine/loads';
import { unitsOf } from '../../engine/units';
import type { ISODate } from '../../plan/types';
import { logMax } from '../../state/actions';
import { toast } from '../../state/hooks';
import { Card, Field, NumInput, Seg, SectionTitle, Sheet } from '../../ui/kit';
import { saveRecord } from '../actions';
import { RETEST, retestE1rm, retestOffers, type RetestOffer } from '../retest';

/** Recover screen: lifts worth a conservative retest, offered only when nothing protected touches them. */
export function RetestSection({ data, date }: { data: Data; date: ISODate }) {
  const offers = retestOffers(date, data);
  const [open, setOpen] = useState<RetestOffer | null>(null);
  if (!offers.length) return null;
  return (
    <section className="section" aria-label="Retest">
      <SectionTitle>Retest</SectionTitle>
      <Card>
        <div className="row" style={{ gap: 8 }}><Target size={16} style={{ color: 'var(--moss)' }} /><span className="label">Re-establish your e1RM</span></div>
        <div className="small muted" style={{ marginTop: 4 }}>One rep-out set with reps in reserve. Never a max attempt, and never on a lift that touches a recovering area.</div>
        {offers.map((o) => (
          <button key={o.lift} className="list-row" style={{ width: '100%', background: 'none', border: 0, color: 'inherit', textAlign: 'left' }} onClick={() => setOpen(o)}>
            <span className="grow"><span style={{ fontWeight: 600 }}>{o.name}</span><br /><span className="small muted">{o.reason}</span></span>
          </button>
        ))}
      </Card>
      <Sheet open={!!open} title={open ? `Retest · ${open.name}` : 'Retest'} onClose={() => setOpen(null)}>
        {open && <RetestBody key={open.lift} data={data} date={date} offer={open} onDone={() => setOpen(null)} />}
      </Sheet>
    </section>
  );
}

function RetestBody({ data, date, offer, onDone }: { data: Data; date: ISODate; offer: RetestOffer; onDone: () => void }) {
  const u = unitsOf(data.profile);
  const [kg, setKg] = useState<number | undefined>(offer.targetKg != null ? u.show(offer.targetKg) : undefined);
  const [reps, setReps] = useState<number | undefined>();
  const [rir, setRir] = useState<number>(offer.rir);
  const realKg = kg != null ? u.fromDisplay(kg) : undefined;
  const bw = bodyweightOn(date, data);
  const total = realKg != null ? (offer.added ? (bw ?? 0) + realKg : realKg) : undefined;
  const est = total != null && reps ? retestE1rm(total, Math.min(reps, RETEST.maxReps), rir) : null;
  const save = async (log: boolean) => {
    if (realKg == null || !reps) return;
    const r = Math.min(reps, RETEST.maxReps);
    await saveRecord<'retest'>({ kind: 'retest', date, lift: offer.lift, kg: realKg, reps: r, rir });
    if (log) await logMax(date, offer.lift, realKg, r, offer.added ? (bw ?? undefined) : undefined, 'test');
    toast(log ? 'Retest saved and logged as a rep max' : 'Retest saved');
    onDone();
  };
  return (
    <div className="stack">
      <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
        <li>Warm up: {offer.ramp.length ? offer.ramp.map((s) => `${u.w(s.kg)} × ${s.reps}`).join(', ') : 'a few easy sets'}.</li>
        <li>{offer.targetKg != null ? `One set at ${u.w(offer.targetKg)} (about 75% of your current e1RM).` : offer.added ? 'One set with a light added load.' : 'One set at a load you could lift about 8 times.'}</li>
        <li>Stop with {offer.rir} reps still in the tank{offer.spine ? ' (spine-loaded lift: never close to failure)' : ''}, or at {RETEST.maxReps} reps.</li>
      </ol>
      <div className="row" style={{ gap: 8 }}>
        <div className="grow"><Field label={offer.added ? 'Added load' : 'Load'}><NumInput value={kg} onChange={setKg} unit={u.label} label="Retest load" min={0} /></Field></div>
        <div className="grow"><Field label="Reps"><NumInput value={reps} onChange={setReps} label="Retest reps" min={1} max={RETEST.maxReps} /></Field></div>
      </div>
      <Field group label="Reps left in the tank">
        <Seg label="Reps in reserve" tone="moss" value={rir} onChange={setRir} options={[offer.rir, offer.rir + 1, offer.rir + 2].map((n) => ({ value: n, label: n }))} />
      </Field>
      {est && <div className="small">e1RM about {u.w(est.logged)} from the reps done (logged, conservative); up to {u.w(est.upper)} counting the reps in reserve.</div>}
      {offer.added && bw == null && <div className="small" style={{ color: 'var(--gold)' }}>Log your weight first: pull-up e1RMs include bodyweight.</div>}
      <button className="btn primary block" disabled={!est} onClick={() => void save(true)}>Save and use as my e1RM</button>
      <button className="btn block" disabled={!est} onClick={() => void save(false)}>Save without changing the e1RM</button>
      <div className="tiny muted">A conservative estimate (Epley formula) from a set short of failure.</div>
    </div>
  );
}
