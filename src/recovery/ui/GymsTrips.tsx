import { useState } from 'react';
import { Dumbbell, Plane, Trash2 } from 'lucide-react';
import type { Data } from '../../engine/model';
import { formatMedium } from '../../engine/dates';
import type { ISODate } from '../../plan/types';
import { go, toast } from '../../state/hooks';
import { Card, Field, NumInput, Seg, SectionTitle, Toggle } from '../../ui/kit';
import { deleteRecord, saveRecord, saveSettings } from '../actions';
import { GYM_KIT, KIT_LABEL, type GymKit } from '../model';
import { gyms, kitText, KIT_WORD, type Trip } from '../travel';
import { DateInput, Picks } from './widgets';

/** Gyms (sessions adapt to the kit) and, with Smart travel on, dated trips. */
export function GymsTripsSection({ data, date }: { data: Data; date: ISODate }) {
  return (
    <section className="section" aria-label="Gyms and travel">
      <SectionTitle>Gyms and travel</SectionTitle>
      <GymsCard data={data} />
      <TripsCard data={data} date={date} />
    </section>
  );
}

function GymsCard({ data }: { data: Data }) {
  const list = gyms(data);
  const activeId = data.recovery?.settings.activeGymId ?? null;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [kit, setKit] = useState<GymKit[]>(['dumbbells', 'bench', 'cable', 'machines']);
  const [dbMax, setDbMax] = useState<number | undefined>();
  const add = async () => {
    if (!name.trim()) return;
    const g = await saveRecord<'gym'>({ kind: 'gym', name: name.trim(), kit, dumbbellMaxKg: dbMax });
    await saveSettings({ activeGymId: g.id });
    toast(`${g.name} saved and in use`);
    setAdding(false);
    setName('');
  };
  return (
    <Card>
      <div className="row" style={{ gap: 8 }}><Dumbbell size={16} style={{ color: 'var(--frost)' }} /><span className="label">Gyms</span></div>
      <div className="small muted" style={{ marginTop: 4 }}>Pick the gym you train in: exercises it cannot host are swapped for ones it can, or skipped. No gym picked: a full gym.</div>
      <div className="stack tight" style={{ marginTop: 8 }}>
        <Toggle on={!activeId} onChange={(v) => v && void saveSettings({ activeGymId: null })} label="Full gym (the plan as written)" />
        {list.map((g) => (
          <div key={g.id} className="row" style={{ gap: 8 }}>
            <div className="grow"><Toggle on={activeId === g.id} onChange={(v) => void saveSettings({ activeGymId: v ? g.id : null })} label={g.name} sub={kitText(g.kit)} /></div>
            <button className="icon-btn" aria-label={`Delete ${g.name}`} onClick={() => void (activeId === g.id ? saveSettings({ activeGymId: null }) : Promise.resolve()).then(() => deleteRecord(g.id))}><Trash2 size={18} /></button>
          </div>
        ))}
      </div>
      {adding ? (
        <div className="stack" style={{ marginTop: 10 }}>
          <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hotel gym, home" /></Field>
          <Field group label="Equipment">
            <Picks label="Equipment" tone="frost" value={kit} onChange={setKit} options={GYM_KIT.map((k) => ({ value: k, label: KIT_LABEL[k] }))} />
          </Field>
          <Field label="Heaviest dumbbell"><NumInput value={dbMax} onChange={setDbMax} unit="kg" label="Heaviest dumbbell" min={0} /></Field>
          <button className="btn primary block" disabled={!name.trim()} onClick={() => void add()}>Save gym</button>
        </div>
      ) : (
        <button className="btn block" style={{ marginTop: 10 }} onClick={() => setAdding(true)}>Add a gym</button>
      )}
    </Card>
  );
}

function TripsCard({ data, date }: { data: Data; date: ISODate }) {
  const smart = data.recovery?.settings.smartTravel === true;
  const list = (data.recovery?.records ?? []).filter((r): r is Trip => r.kind === 'trip' && r.until >= date).sort((a, b) => (a.date < b.date ? -1 : 1));
  const [adding, setAdding] = useState(false);
  const [from, setFrom] = useState<ISODate | undefined>(date);
  const [until, setUntil] = useState<ISODate | undefined>();
  const [kit, setKit] = useState<Trip['kit']>('bodyweight');
  const [flight, setFlight] = useState<number | undefined>();
  const [zones, setZones] = useState<number | undefined>();
  const [direction, setDirection] = useState<'east' | 'west'>('east');
  const [short, setShort] = useState(false);
  if (!smart) {
    return (
      <Card>
        <div className="row" style={{ gap: 8 }}><Plane size={16} style={{ color: 'var(--gold)' }} /><span className="label">Trips</span></div>
        <div className="small muted" style={{ marginTop: 4 }}>Travel mode works as before (the toggle on Train). Turn on Smart travel in Settings for yoke-first travel kits, dated trips, flight days and an easier return.</div>
        <button className="btn block" style={{ marginTop: 8 }} onClick={() => go('settings')}>Open Settings</button>
      </Card>
    );
  }
  const add = async () => {
    if (!from || !until || until < from) return;
    await saveRecord<'trip'>({ kind: 'trip', date: from, until, kit, flightHours: flight, zones, direction: zones ? direction : undefined, shortSessions: short || undefined });
    toast('Trip saved: those days become travel days');
    setAdding(false);
  };
  return (
    <Card>
      <div className="row" style={{ gap: 8 }}><Plane size={16} style={{ color: 'var(--gold)' }} /><span className="label">Trips</span></div>
      {list.map((t) => (
        <div key={t.id} className="row" style={{ gap: 8, marginTop: 8 }}>
          <div className="grow small">
            <span style={{ fontWeight: 700 }}>{formatMedium(t.date)} to {formatMedium(t.until)}</span>
            <div className="muted">{KIT_WORD[t.kit]}{t.flightHours ? ` · flight ${t.flightHours} h` : ''}{t.zones ? ` · ${t.zones} zones ${t.direction}` : ''}{t.shortSessions ? ' · short sessions' : ''}</div>
          </div>
          <button className="icon-btn" aria-label="Delete trip" onClick={() => void deleteRecord(t.id)}><Trash2 size={18} /></button>
        </div>
      ))}
      {!list.length && !adding && <div className="small muted" style={{ marginTop: 6 }}>No trip planned.</div>}
      {adding ? (
        <div className="stack" style={{ marginTop: 10 }}>
          <div className="row" style={{ gap: 8 }}>
            <div className="grow"><DateInput label="From" value={from} onChange={setFrom} /></div>
            <div className="grow"><DateInput label="Until" value={until} onChange={setUntil} /></div>
          </div>
          <Field group label="Equipment there">
            <Seg label="Equipment there" tone="frost" wrap value={kit} onChange={setKit} options={(Object.keys(KIT_WORD) as Trip['kit'][]).map((k) => ({ value: k, label: KIT_WORD[k] }))} />
          </Field>
          <Field label="Flight (hours, each way)"><NumInput value={flight} onChange={setFlight} unit="h" label="Flight hours" min={0} /></Field>
          <div className="row" style={{ gap: 8 }}>
            <div className="grow"><Field label="Time zones crossed"><NumInput value={zones} onChange={setZones} label="Time zones" min={0} max={12} /></Field></div>
            <div className="grow"><Field group label="Flying"><Seg label="Direction" tone="frost" value={direction} onChange={setDirection} options={[{ value: 'east', label: 'East' }, { value: 'west', label: 'West' }]} /></Field></div>
          </div>
          <Toggle on={short} onChange={setShort} label="Short sessions" sub="About 20 minutes: yoke first, one push, one pull." />
          <button className="btn primary block" disabled={!from || !until || until < from} onClick={() => void add()}>Save trip</button>
        </div>
      ) : (
        <button className="btn block" style={{ marginTop: 10 }} onClick={() => setAdding(true)}>Plan a trip</button>
      )}
    </Card>
  );
}
