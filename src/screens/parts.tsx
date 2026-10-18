import { useState } from 'react';
import {
  ArrowUp,
  Bed,
  Eye,
  Footprints,
  Moon,
  Plane,
  Repeat,
  RotateCcw,
  Scale,
  Sparkles,
  Swords,
  Target,
  TriangleAlert,
  Trophy,
  Utensils,
  X,
  Mountain,
  CalendarDays,
  Pencil,
} from 'lucide-react';
import type { Insight } from '../engine/insights';
import type { Checkin, HrvStatus, SessionType } from '../engine/model';
import { formatSleep } from '../engine/dates';
import type { DayView } from '../engine/today';
import type { ISODate } from '../plan/types';
import { applyAction, dismiss, saveCheckin, setOverride } from '../state/actions';
import { toast } from '../state/hooks';
import { Card, Chip, Field, Fold, NumInput, Seg, Sheet, Toggle, TypeBadge, TypeChip, Why, cx } from '../ui/kit';

const INSIGHT_ICON: Record<Insight['icon'], typeof Swords> = {
  alert: TriangleAlert,
  swap: Repeat,
  test: Target,
  reload: RotateCcw,
  block: CalendarDays,
  moon: Moon,
  plane: Plane,
  run: Footprints,
  plateau: Mountain,
  up: ArrowUp,
  food: Utensils,
  scale: Scale,
  habit: Sparkles,
  season: CalendarDays,
  trophy: Trophy,
  eye: Eye,
};

export function InsightCard({ insight, date }: { insight: Insight; date: ISODate }) {
  const Icon = INSIGHT_ICON[insight.icon];
  return (
    <Card tone={insight.tone} tint>
      <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
        <div style={{ color: 'var(--tone)', paddingTop: 2 }}>
          <Icon size={22} aria-hidden="true" />
        </div>
        <div className="grow stack tight">
          <div style={{ fontWeight: 700, fontSize: 15 }}>{insight.title}</div>
          {insight.body && <div className="small muted">{insight.body}</div>}
          <div className="row wrap" style={{ gap: 4 }}>
            {insight.action && (
              <button className="btn small" style={{ borderColor: 'var(--tone)', color: 'var(--tone)' }} onClick={() => void applyAction(insight.action!, date)}>
                {insight.action.label}
              </button>
            )}
            <Why lines={insight.why} />
          </div>
        </div>
        {insight.dismissible && (
          <button className="icon-btn" aria-label="Dismiss" onClick={() => void dismiss(insight.id, date)} style={{ margin: '-10px -10px 0 0' }}>
            <X size={18} />
          </button>
        )}
      </div>
    </Card>
  );
}

export function OverrideSheet({ view, open, onClose }: { view: DayView; open: boolean; onClose: () => void }) {
  const d = view.decision;
  const pick = async (t: SessionType | null) => {
    await setOverride(view.date, t);
    onClose();
  };
  return (
    <Sheet open={open} title="Today's session type" onClose={onClose}>
      <div className="stack">
        {d.cap && <div className="small muted">Pain rules keep their swaps whatever you pick.</div>}
        <div className="stack tight">
          {d.allowed.map((t) => (
            <button key={t} className={cx('btn block', d.type === t && 'frost')} style={{ justifyContent: 'space-between' }} onClick={() => void pick(t === d.suggested ? null : t)}>
              <TypeChip type={t} />
              <span className="tiny">{t === d.suggested ? 'Suggested' : d.type === t ? 'Chosen' : ''}</span>
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

export function DecisionBadge({ view, compact }: { view: DayView; compact?: boolean }) {
  const d = view.decision;
  const [open, setOpen] = useState(false);
  return (
    <div className="stack tight">
      <TypeBadge type={d.type} reason={d.pending ? 'Check in to tailor today' : d.reason} score={d.readiness?.score ?? null} />
      {!compact && (
        <div className="row wrap" style={{ gap: 6 }}>
          {d.why.length > 0 && <Why lines={d.why} />}
          {d.type !== 'Rest' && !d.pending && (
            <button className="link-btn" onClick={() => setOpen(true)}>
              Change
            </button>
          )}
          {d.canUseFull && !d.overridden && (
            <button className="link-btn" onClick={() => void setOverride(view.date, 'Full')}>
              Use the full session anyway
            </button>
          )}
          {d.overridden && (
            <button className="link-btn" onClick={() => void setOverride(view.date, null)}>
              Back to {d.suggested}
            </button>
          )}
        </div>
      )}
      <OverrideSheet view={view} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

// ---------------------------------------------------------------- check-in

const HRV: { value: HrvStatus; label: string }[] = [
  { value: 'balanced', label: 'Balanced' },
  { value: 'unbalanced', label: 'Unbal.' },
  { value: 'low', label: 'Low' },
  { value: 'none', label: 'None' },
];
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export function CheckinForm({ date, initial, onDone }: { date: ISODate; initial?: Checkin; onDone?: () => void }) {
  const [h, setH] = useState<number | undefined>(initial ? Math.floor(initial.sleepMin / 60) : undefined);
  const [m, setM] = useState<number | undefined>(initial ? initial.sleepMin % 60 : undefined);
  const [score, setScore] = useState<number | undefined>(initial?.sleepScore);
  const [bb, setBb] = useState<number | undefined>(initial?.bodyBattery);
  const [hrv, setHrv] = useState<HrvStatus | undefined>(initial?.hrvStatus);
  const [rhr, setRhr] = useState<number | undefined>(initial?.restingHr);
  const [energy, setEnergy] = useState<number | undefined>(initial?.energy);
  const [stress, setStress] = useState<number | undefined>(initial?.stress);
  const [back, setBack] = useState<number>(initial?.backPain ?? 0);
  const [knee, setKnee] = useState<number>(initial?.kneePain ?? 0);
  const [radiating, setRadiating] = useState<boolean>(!!initial?.radiating);
  const sleepMin = h != null ? h * 60 + (m ?? 0) : undefined;
  const ready = sleepMin != null && sleepMin > 0 && sleepMin < 24 * 60 && score != null && score <= 100 && energy != null && stress != null;
  const save = async () => {
    if (!ready) return;
    await saveCheckin(date, {
      sleepMin: sleepMin as number,
      sleepScore: score as number,
      bodyBattery: bb,
      hrvStatus: hrv,
      restingHr: rhr,
      energy: energy as number,
      stress: stress as number,
      backPain: back,
      kneePain: knee,
      radiating: back > 0 && radiating ? true : undefined,
    });
    toast('Check-in saved');
    onDone?.();
  };
  return (
    <div className="stack">
      <div className="grid2">
        <Field group label="Sleep">
          <div className="row" style={{ gap: 6 }}>
            <NumInput value={h} onChange={setH} unit="h" label="Sleep hours" className="num" />
            <NumInput value={m} onChange={setM} unit="min" label="Sleep minutes" className="num" />
          </div>
        </Field>
        <Field label="Sleep score">
          <NumInput value={score} onChange={setScore} placeholder="0-100" label="Garmin sleep score" className="num" />
        </Field>
      </div>
      <Field group label="Energy">
        <Seg label="Energy, 1 to 5" tone="moss" value={energy} onChange={setEnergy} options={range(1, 5).map((v) => ({ value: v, label: v }))} />
      </Field>
      <Field group label="Stress">
        <Seg label="Stress, 1 to 5" tone="gold" value={stress} onChange={setStress} options={range(1, 5).map((v) => ({ value: v, label: v }))} />
      </Field>
      <Field group label={`Back pain · ${back}`}>
        <Seg label="Back pain, 0 to 10" tone={back >= 5 ? 'ember' : back >= 3 ? 'gold' : 'moss'} wrap value={back} onChange={setBack} options={range(0, 10).map((v) => ({ value: v, label: v }))} />
      </Field>
      {back > 0 && <Toggle on={radiating} onChange={setRadiating} tone="ember" label="Pain down the leg, numbness or weakness" />}
      <Field group label={`Knee pain · ${knee}`}>
        <Seg label="Knee pain, 0 to 10" tone={knee >= 5 ? 'ember' : knee >= 3 ? 'gold' : 'moss'} wrap value={knee} onChange={setKnee} options={range(0, 10).map((v) => ({ value: v, label: v }))} />
      </Field>
      <Fold title={<span className="small muted">More from Garmin (optional)</span>} open={bb != null || rhr != null || hrv != null}>
        <div className="stack" style={{ paddingTop: 6 }}>
          <div className="grid2">
            <Field label="Body Battery">
              <NumInput value={bb} onChange={setBb} placeholder="0-100" label="Body Battery on waking" className="num" />
            </Field>
            <Field label="Resting HR">
              <NumInput value={rhr} onChange={setRhr} unit="bpm" label="Resting heart rate" className="num" />
            </Field>
          </div>
          <Field group label="HRV status">
            <Seg label="HRV status" tone="frost" value={hrv} onChange={setHrv} options={HRV} />
          </Field>
        </div>
      </Fold>
      <button className="btn primary block" disabled={!ready} onClick={() => void save()}>
        Save check-in
      </button>
    </div>
  );
}

export function CheckinCard({ view }: { view: DayView }) {
  const [editing, setEditing] = useState(false);
  const c = view.checkin;
  if (!c || editing) {
    return (
      <Card toned tone="frost">
        <div className="card-head" style={{ marginBottom: 10 }}>
          <div>
            <div className="label">Morning check-in</div>
            <div className="small muted">20 seconds, numbers from Garmin Connect</div>
          </div>
          <Bed size={22} color="var(--frost)" aria-hidden="true" />
        </div>
        <CheckinForm date={view.date} initial={c} onDone={() => setEditing(false)} />
      </Card>
    );
  }
  return (
    <div className="stack tight">
      <DecisionBadge view={view} />
      <div className="row wrap" style={{ gap: 6 }}>
        <Chip plain>
          <Moon size={12} /> {formatSleep(c.sleepMin)} · {c.sleepScore}
        </Chip>
        {c.bodyBattery != null && <Chip plain>BB {c.bodyBattery}</Chip>}
        <Chip plain>Energy {c.energy}</Chip>
        <Chip plain>Stress {c.stress}</Chip>
        {(c.backPain > 0 || c.kneePain > 0) && <Chip tone={c.backPain >= 5 || c.kneePain >= 5 ? 'ember' : 'gold'}>Pain {c.backPain}/{c.kneePain}</Chip>}
        <button className="link-btn row" style={{ gap: 4 }} onClick={() => setEditing(true)}>
          <Pencil size={14} /> Edit
        </button>
      </div>
    </div>
  );
}
