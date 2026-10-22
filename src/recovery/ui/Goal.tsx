import { useMemo, useState } from 'react';
import { ChevronRight, Ruler, ShieldAlert, ShieldCheck, TrendingDown } from 'lucide-react';
import type { Data } from '../../engine/model';
import { unitsOf } from '../../engine/units';
import type { ISODate } from '../../plan/types';
import { go, toast } from '../../state/hooks';
import { Card, Chip, Field, NumInput, SectionTitle, cx } from '../../ui/kit';
import { saveRecord } from '../actions';
import { guardian, resolveGoal, STATUS_TONE, STATUS_WORD, type GoalStatus, type GuardianView, type MuscleWeek } from '../goal';
import type { RecordOf } from '../model';
import { YOKE } from '../volume';

const ICON: Record<GoalStatus, typeof ShieldCheck> = { maintained: ShieldCheck, slowed: TrendingDown, 'at-risk': ShieldAlert };

export const useGuardian = (data: Data, date: ISODate) => useMemo(() => guardian(date, data), [data, date]);

/** Icon + word + colour, like the session badge (never colour alone). */
function Verdict({ g, compact }: { g: GuardianView; compact?: boolean }) {
  const I = ICON[g.status];
  return (
    <div className={cx('badge', `t-${STATUS_TONE[g.status]}`)}>
      <div className="ico">
        <I size={22} strokeWidth={2.2} aria-hidden="true" />
      </div>
      <div className="grow">
        <div className="label" style={{ color: 'var(--tone)' }}>Goal · 2029</div>
        <div className="word">{STATUS_WORD[g.status]}</div>
        <div className="why">{g.reason}</div>
        {!compact && g.why.length > 0 && <div className="tiny muted" style={{ marginTop: 4 }}>{g.why.join(' ')}</div>}
      </div>
    </div>
  );
}

function MuscleBars({ rows }: { rows: MuscleWeek[] }) {
  return (
    <div className="stack tight">
      {rows.map((v) => {
        const pct = v.target ? Math.min(1, v.projected / v.target) : 0;
        return (
          <div key={v.muscle}>
            <div className="bar-row">
              <span className="small">{v.muscle}{YOKE.includes(v.muscle) ? <span className="muted"> · yoke</span> : null}</span>
              <span className="small">{v.status === 'paused' ? 'paused' : <><b>{v.projected}/{v.target}</b> <span className="muted">· {v.days} {v.days === 1 ? 'day' : 'days'}</span></>}</span>
            </div>
            <div className={cx('bar', v.status === 'met' ? 't-moss' : v.status === 'paused' ? 't-ash' : 't-gold')} style={{ marginTop: 3 }}>
              <i style={{ width: `${v.status === 'paused' ? 100 : pct * 100}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Today: a compact Goal card. */
export function GoalCard({ data, date }: { data: Data; date: ISODate }) {
  const g = useGuardian(data, date);
  const yoke = g.volume.filter((v) => YOKE.includes(v.muscle) && v.status !== 'untrained');
  return (
    <section className="section" aria-label="Goal">
      <SectionTitle right={<button className="link-btn row" style={{ gap: 2 }} onClick={() => go('recover/goal')}>Details <ChevronRight size={14} /></button>}>Goal</SectionTitle>
      <Verdict g={g} compact />
      <Card>
        <div className="stack tight">
          <div className="chips">
            {yoke.map((v) => (
              <Chip key={v.muscle} tone={v.status === 'met' ? 'moss' : v.status === 'paused' ? 'ash' : 'gold'}>{v.muscle} {v.status === 'paused' ? 'paused' : `${v.projected}/${v.target}`}</Chip>
            ))}
          </div>
          {g.paused.length > 0 && <div className="small"><span className="muted">Paused:</span> {g.paused.join(' · ')}</div>}
          <ol className="small" style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {g.actions.map((a) => <li key={a}>{a}</li>)}
          </ol>
          {g.tradeoffs[0] && <div className="small" style={{ color: 'var(--gold)' }}>{g.tradeoffs[0]}</div>}
          <div className="row between" style={{ marginTop: 2 }}>
            <span className="small"><span className="muted">Goal date</span> <b>{g.range.label}</b></span>
          </div>
          <div className="tiny muted">Estimates, not promises. Not medical advice.</div>
        </div>
      </Card>
    </section>
  );
}

/** Recover screen: the full Guardian view. */
export function GoalPanel({ data, date }: { data: Data; date: ISODate }) {
  const g = useGuardian(data, date);
  const u = unitsOf(data.profile);
  const goalRows = g.volume.filter((v) => v.status !== 'untrained');
  return (
    <section className="section" aria-label="Goal Guardian">
      <SectionTitle>Goal Guardian</SectionTitle>
      <Verdict g={g} />
      <Card>
        <div className="label" style={{ marginBottom: 6 }}>The goal</div>
        <div className="small">About {u.w((g.goal.weightKg[0] + g.goal.weightKg[1]) / 2, 1)} at about {Math.round((g.goal.bodyFatPct[0] + g.goal.bodyFatPct[1]) / 2)}% body fat, a strong yoke (traps, shoulders, upper back) and real strength.</div>
        <div className="small" style={{ marginTop: 6 }}><span className="muted">Estimated:</span> <b>{g.range.label}</b></div>
        <ul className="tiny muted" style={{ margin: '4px 0 0', paddingLeft: 18 }}>
          {g.range.why.map((w) => <li key={w}>{w}</li>)}
        </ul>
      </Card>
      <Card>
        <div className="label" style={{ marginBottom: 6 }}>This week</div>
        <div className="grid2 small">
          {(Object.entries(g.parts) as [string, { status: string; reason: string }][]).map(([k, p]) => (
            <div key={k}><span className="muted" style={{ textTransform: 'capitalize' }}>{k}</span><br /><b className={cx(p.status !== 'not-judged' && `t-${STATUS_TONE[p.status as GoalStatus]}`)} style={{ color: p.status === 'not-judged' ? 'var(--muted)' : 'var(--tone)' }}>{p.status === 'not-judged' ? 'Not judged' : STATUS_WORD[p.status as GoalStatus]}</b><div className="tiny muted">{p.reason}</div></div>
          ))}
        </div>
      </Card>
      <Card>
        <div className="label" style={{ marginBottom: 6 }}>Sets per muscle this week · done plus planned</div>
        <MuscleBars rows={goalRows} />
        <div className="tiny muted" style={{ marginTop: 8 }}>Rule: every muscle 2+ times a week and 10+ sets, neck 8. In planned easier weeks the target follows the plan.</div>
      </Card>
      {(g.actions.length > 0 || g.tradeoffs.length > 0) && (
        <Card tone="gold" tint>
          <div className="label">This week, to stay on track</div>
          <ol className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>{g.actions.map((a) => <li key={a}>{a}</li>)}</ol>
          {g.tradeoffs.map((t) => <div key={t} className="small" style={{ marginTop: 6 }}>{t}</div>)}
        </Card>
      )}
      <Measurements data={data} date={date} />
      <GoalOverride data={data} />
      <div className="tiny muted">Estimates, not promises. Not medical advice.</div>
    </section>
  );
}

/** Sunday review: one section between "This week" and "Next week". */
export function GoalWeek({ data, date }: { data: Data; date: ISODate }) {
  const g = useGuardian(data, date);
  return (
    <Card tone={STATUS_TONE[g.status]} tint>
      <div className="label">Goal · {STATUS_WORD[g.status]}</div>
      <div className="small" style={{ marginTop: 4 }}>{g.reason}</div>
      <div className="chips" style={{ marginTop: 8 }}>
        {g.volume.filter((v) => v.status !== 'untrained' && v.muscle !== 'Core').map((v) => (
          <Chip key={v.muscle} tone={v.status === 'met' ? 'moss' : v.status === 'paused' ? 'ash' : 'gold'}>{v.muscle} {v.status === 'paused' ? 'paused' : `${v.projected}/${v.target}`}</Chip>
        ))}
      </div>
      {g.paused.length > 0 && <div className="small" style={{ marginTop: 6 }}><span className="muted">Paused:</span> {g.paused.join(' · ')}</div>}
      <div className="small" style={{ marginTop: 6 }}><span className="muted">Goal date:</span> {g.range.label}</div>
      <ol className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>{g.actions.map((a) => <li key={a}>{a}</li>)}</ol>
    </Card>
  );
}

const MEASURES: { key: 'neckCm' | 'shouldersCm' | 'chestCm' | 'armCm'; label: string }[] = [
  { key: 'neckCm', label: 'Neck' },
  { key: 'shouldersCm', label: 'Shoulders' },
  { key: 'chestCm', label: 'Chest' },
  { key: 'armCm', label: 'Arm' },
];

/** Goal-critical girths, stored on this phone and in the private backup only. */
function Measurements({ data, date }: { data: Data; date: ISODate }) {
  const rows = (data.recovery?.records ?? []).filter((r): r is RecordOf<'measure'> => r.kind === 'measure').sort((a, b) => (a.date < b.date ? -1 : 1));
  const last = rows.at(-1);
  const prev = rows.at(-2);
  const [v, setV] = useState<Partial<Record<(typeof MEASURES)[number]['key'], number>>>({});
  const save = async () => {
    if (!Object.values(v).some((x) => x != null)) return;
    await saveRecord<'measure'>({ kind: 'measure', date, ...v });
    setV({});
    toast('Measurements saved');
  };
  return (
    <Card>
      <div className="row between">
        <div className="label">Measurements</div>
        <Ruler size={16} className="muted" />
      </div>
      {last && (
        <div className="chips" style={{ marginTop: 6 }}>
          {MEASURES.filter((m) => last[m.key] != null).map((m) => {
            const d = prev?.[m.key] != null ? (last[m.key] as number) - (prev[m.key] as number) : null;
            return <Chip key={m.key} tone="frost">{m.label} {last[m.key]} cm{d ? ` (${d > 0 ? '+' : ''}${Math.round(d * 10) / 10})` : ''}</Chip>;
          })}
        </div>
      )}
      <div className="grid2" style={{ marginTop: 8 }}>
        {MEASURES.map((m) => (
          <Field key={m.key} label={m.label}><NumInput value={v[m.key]} onChange={(x) => setV({ ...v, [m.key]: x })} unit="cm" label={m.label} /></Field>
        ))}
      </div>
      <button className="btn block" style={{ marginTop: 8 }} disabled={!Object.values(v).some((x) => x != null)} onClick={() => void save()}>Save measurements</button>
      <div className="tiny muted" style={{ marginTop: 6 }}>Monthly is enough. Same tape, same spot, relaxed.</div>
    </Card>
  );
}

/** Optional: change the weight and body-fat bands. The plan's own targets are the default. */
function GoalOverride({ data }: { data: Data }) {
  const o = data.recovery?.records.find((r): r is RecordOf<'goal'> => r.kind === 'goal');
  const g = useMemo(() => resolveGoal(data), [data]);
  const u = unitsOf(data.profile);
  const [w0, setW0] = useState<number | undefined>(o?.weightKg ? u.show(o.weightKg[0]) : undefined);
  const [w1, setW1] = useState<number | undefined>(o?.weightKg ? u.show(o.weightKg[1]) : undefined);
  const [b0, setB0] = useState<number | undefined>(o?.bodyFatPct?.[0]);
  const [b1, setB1] = useState<number | undefined>(o?.bodyFatPct?.[1]);
  const save = async () => {
    await saveRecord<'goal'>({
      id: o?.id ?? 'goal',
      kind: 'goal',
      weightKg: w0 != null && w1 != null ? [u.fromDisplay(Math.min(w0, w1)), u.fromDisplay(Math.max(w0, w1))] : undefined,
      bodyFatPct: b0 != null && b1 != null ? [Math.min(b0, b1), Math.max(b0, b1)] : undefined,
    });
    toast('Goal bands saved');
  };
  return (
    <Card>
      <div className="label">Goal bands {g.overridden ? '· yours' : '· from the plan'}</div>
      <div className="small muted" style={{ marginTop: 4 }}>Now {u.w(g.weightKg[0], 1)} to {u.w(g.weightKg[1], 1)}, {g.bodyFatPct[0]} to {g.bodyFatPct[1]}% body fat.</div>
      <div className="grid2" style={{ marginTop: 8 }}>
        <Field label="Weight from"><NumInput value={w0} onChange={setW0} unit={u.label} label="Weight from" /></Field>
        <Field label="Weight to"><NumInput value={w1} onChange={setW1} unit={u.label} label="Weight to" /></Field>
        <Field label="Body fat from"><NumInput value={b0} onChange={setB0} unit="%" label="Body fat from" /></Field>
        <Field label="Body fat to"><NumInput value={b1} onChange={setB1} unit="%" label="Body fat to" /></Field>
      </div>
      <button className="btn block" style={{ marginTop: 8 }} onClick={() => void save()}>Save goal bands</button>
    </Card>
  );
}
