import { useState } from 'react';
import type { Data } from '../../engine/model';
import { addDays, diffDays, formatShort } from '../../engine/dates';
import type { ISODate } from '../../plan/types';
import { toast } from '../../state/hooks';
import { LineChart } from '../../ui/charts';
import { Card, Field, Seg, Sheet } from '../../ui/kit';
import { saveRecord } from '../actions';
import { REGION_LABEL, type RecordOf, type Region, type Side } from '../model';
import { activeInjuries, injuryName } from '../state';
import { PainSeg } from './widgets';

type Shape = { region: Region; side: Side; kind: 'e' | 'r'; a: number; b: number; c: number; d: number };
const e = (region: Region, side: Side, cx: number, cy: number, rx: number, ry: number): Shape => ({ region, side, kind: 'e', a: cx, b: cy, c: rx, d: ry });
const r = (region: Region, side: Side, x: number, y: number, w: number, h: number): Shape => ({ region, side, kind: 'r', a: x, b: y, c: w, d: h });

/** Limbs on both sides; `near` is the side drawn on the viewer's left. Front view: the figure's right is on the left. */
function limbs(near: Side, far: Side): Shape[] {
  return [
    e('shoulder', near, 70, 72, 14, 10), e('shoulder', far, 130, 72, 14, 10),
    e('upper-arm', near, 60, 100, 9, 20), e('upper-arm', far, 140, 100, 9, 20),
    e('elbow', near, 56, 126, 7, 6), e('elbow', far, 144, 126, 7, 6),
    e('forearm', near, 52, 150, 7, 17), e('forearm', far, 148, 150, 7, 17),
    e('wrist-hand', near, 48, 177, 7, 9), e('wrist-hand', far, 152, 177, 7, 9),
  ];
}
// Ellipses and rectangles only: no path data.
const FRONT: Shape[] = [
  r('neck', 'midline', 91, 48, 18, 13), r('chest', 'midline', 78, 64, 44, 36), r('abdomen', 'midline', 80, 102, 40, 40),
  ...limbs('right', 'left'),
  e('hip', 'right', 81, 152, 10, 9), e('hip', 'left', 119, 152, 10, 9), e('groin', 'midline', 100, 163, 8, 6),
  e('quad', 'right', 84, 200, 12, 30), e('quad', 'left', 116, 200, 12, 30),
  e('adductor', 'right', 95, 190, 4, 15), e('adductor', 'left', 105, 190, 4, 15),
  e('knee', 'right', 84, 240, 9, 8), e('knee', 'left', 116, 240, 9, 8),
  e('shin', 'right', 84, 278, 7, 25), e('shin', 'left', 116, 278, 7, 25),
  e('ankle-foot', 'right', 84, 316, 9, 7), e('ankle-foot', 'left', 116, 316, 9, 7),
];
const BACK: Shape[] = [
  r('neck', 'midline', 91, 48, 18, 13), r('upper-back', 'midline', 76, 62, 48, 42), r('lower-back', 'midline', 82, 106, 36, 32),
  ...limbs('left', 'right'),
  e('glute', 'left', 86, 152, 14, 12), e('glute', 'right', 114, 152, 14, 12),
  e('hamstring', 'left', 86, 198, 11, 28), e('hamstring', 'right', 114, 198, 11, 28),
  e('knee', 'left', 86, 240, 9, 8), e('knee', 'right', 114, 240, 9, 8),
  e('calf', 'left', 86, 274, 9, 24), e('calf', 'right', 114, 274, 9, 24),
  e('ankle-foot', 'left', 86, 316, 9, 7), e('ankle-foot', 'right', 114, 316, 9, 7),
];

const spotName = (region: Region, side: Side) => (side === 'left' || side === 'right' ? `${side === 'left' ? 'Left' : 'Right'} ${REGION_LABEL[region].toLowerCase()}` : REGION_LABEL[region]);

function Figure({ shapes, label, latest, onPick }: { shapes: Shape[]; label: string; latest: (s: Shape) => number | null; onPick: (s: Shape) => void }) {
  return (
    <svg viewBox="0 0 200 330" role="group" aria-label={label} style={{ width: '100%', maxWidth: 170 }}>
      <circle cx={100} cy={28} r={17} fill="var(--ash)" opacity={0.25} />
      {shapes.map((s) => {
        const p = latest(s);
        const k = `${s.region}:${s.side}`;
        const props = {
          role: 'button',
          tabIndex: 0,
          'aria-label': `${spotName(s.region, s.side)}${p != null ? `, pain ${p}` : ''}`,
          onClick: () => onPick(s),
          onKeyDown: (ev: React.KeyboardEvent) => (ev.key === 'Enter' || ev.key === ' ') && onPick(s),
          fill: p != null ? 'var(--ember)' : 'var(--ash)',
          fillOpacity: p != null ? 0.25 + Math.min(0.7, p / 14) : 0.22,
          stroke: 'var(--line)',
          strokeWidth: 1,
          style: { cursor: 'pointer' },
        };
        return s.kind === 'e' ? <ellipse key={k} {...props} cx={s.a} cy={s.b} rx={s.c} ry={s.d} /> : <rect key={k} {...props} x={s.a} y={s.b} width={s.c} height={s.d} rx={4} />;
      })}
    </svg>
  );
}

/** Tap where it hurts, rate it, see it over time. Stored on this phone and in the private backup only. */
export function BodyMap({ data, date }: { data: Data; date: ISODate }) {
  const [pick, setPick] = useState<{ region: Region; side: Side } | null>(null);
  const points = (data.recovery?.records ?? []).filter((x): x is RecordOf<'painPoint'> => x.kind === 'painPoint').sort((a, b) => (a.date < b.date ? -1 : 1));
  const latest = (s: Shape) => points.filter((p) => p.region === s.region && p.side === s.side && p.date <= date && diffDays(date, p.date) <= 7).at(-1)?.pain ?? null;
  const recent = new Map<string, RecordOf<'painPoint'>[]>();
  for (const p of points.filter((x) => diffDays(date, x.date) <= 28)) recent.set(`${p.region}:${p.side}`, [...(recent.get(`${p.region}:${p.side}`) ?? []), p]);
  return (
    <Card>
      <div className="label">Body map</div>
      <div className="small muted" style={{ marginTop: 4 }}>Tap where it hurts and rate it. Front on the left, back on the right.</div>
      <div className="row" style={{ justifyContent: 'space-around', marginTop: 8 }}>
        <Figure shapes={FRONT} label="Front of the body" latest={latest} onPick={setPick} />
        <Figure shapes={BACK} label="Back of the body" latest={latest} onPick={setPick} />
      </div>
      <button className="link-btn small" onClick={() => setPick({ region: 'other', side: 'midline' })}>Somewhere else</button>
      {[...recent.entries()].map(([k, list]) => {
        const last = list.at(-1) as RecordOf<'painPoint'>;
        return (
          <button key={k} className="list-row" style={{ width: '100%', background: 'none', border: 0, color: 'inherit', textAlign: 'left' }} onClick={() => setPick({ region: last.region, side: last.side })}>
            <span className="grow">{spotName(last.region, last.side)}</span>
            <span className="small muted">{last.pain}/10 · {formatShort(last.date)} · {list.length} entr{list.length === 1 ? 'y' : 'ies'}</span>
          </button>
        );
      })}
      <Sheet open={!!pick} title={pick ? spotName(pick.region, pick.side) : 'Pain'} onClose={() => setPick(null)}>
        {pick && <PainPointBody key={`${pick.region}:${pick.side}`} data={data} date={date} pick={pick} points={points} onClose={() => setPick(null)} />}
      </Sheet>
    </Card>
  );
}

function PainPointBody({ data, date, pick, points, onClose }: { data: Data; date: ISODate; pick: { region: Region; side: Side }; points: RecordOf<'painPoint'>[]; onClose: () => void }) {
  const mine = points.filter((p) => p.region === pick.region && p.side === pick.side);
  const today = mine.find((p) => p.date === date);
  const linked = activeInjuries(date, data).filter((a) => a.injury.region === pick.region);
  const [pain, setPain] = useState<number | undefined>(today?.pain);
  const [injuryId, setInjuryId] = useState<string>(today?.injuryId ?? linked[0]?.injury.id ?? '');
  const [note, setNote] = useState(today?.note ?? '');
  const save = async () => {
    if (pain == null) return;
    await saveRecord<'painPoint'>({ ...(today ? { id: today.id } : {}), kind: 'painPoint', date, region: pick.region, side: pick.side, pain, note: note.trim() || undefined, injuryId: injuryId || undefined });
    toast('Pain logged');
    onClose();
  };
  const injury = linked.find((a) => a.injury.id === injuryId);
  const series = [
    { name: 'Body map', tone: 'ember' as const, dots: true, points: mine.map((p) => ({ x: p.date, y: p.pain })) },
    ...(injury ? [{ name: 'Check-in at rest', tone: 'frost' as const, dots: true, points: injury.checkins.filter((c) => c.painRest != null).map((c) => ({ x: c.date, y: c.painRest as number })) }] : []),
  ].filter((s) => s.points.length);
  return (
    <div className="stack">
      <PainSeg label="Pain now" value={pain} onChange={setPain} />
      {linked.length > 0 && (
        <Field group label="Link to an injury">
          <Seg label="Link to an injury" tone="frost" wrap value={injuryId} onChange={setInjuryId} options={[...linked.map((a) => ({ value: a.injury.id, label: injuryName(a.injury) })), { value: '', label: 'None' }]} />
        </Field>
      )}
      <Field label="Note"><input className="input" value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="e.g. after sitting, on stairs" /></Field>
      {series.length > 0 && <LineChart series={series} yDomain={[0, 10]} from={addDays(date, -27)} to={date} unit="/10" />}
      <button className="btn primary block" disabled={pain == null} onClick={() => void save()}>Save pain</button>
      <div className="tiny muted">Not medical advice.</div>
    </div>
  );
}
