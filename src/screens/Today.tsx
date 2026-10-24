import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CloudOff, Pencil, Plus, X } from 'lucide-react';
import type { ScreenProps } from '../App';
import { pastDay, stepsMissing } from '../engine/backfill';
import { addDays, diffDays, formatLong, formatShort, formatSleep, weekdayShort } from '../engine/dates';
import { fmtInt } from '../engine/formulas';
import type { CardioType, Data } from '../engine/model';
import { CARDIO_TYPES, live } from '../engine/model';
import { sessionTone } from '../engine/readiness';
import { completion, type Task } from '../engine/tasks';
import { computeDay, type DayView } from '../engine/today';
import { unitsOf } from '../engine/units';
import { DAILY_CODE, PHASE_LABEL, PHASE_TONE, SEASONS, TPL_LABEL, TPL_TONE } from '../plan';
import type { ISODate, SessionCode } from '../plan/types';
import { dismiss, logBodyToday, logCardio, markSessionDone, reopenSession, setMobility, setSteps, syncReadiness, toggleCode, toggleTask } from '../state/actions';
import { go } from '../state/hooks';
import { Card, Chip, Fold, NumInput, Ring, Runes, SectionTitle, Tick, cx } from '../ui/kit';
import { CheckinCard, CheckinForm, InsightCard } from './parts';
import { RecoveryTodaySlot } from '../recovery/ui/slots';

export function Today({ data, view, route, backupOld }: ScreenProps & { backupOld: boolean }) {
  const past = pastDay(route[1], view.date);
  if (past) return <PastDay key={past} data={data} date={past} today={view.date} />;
  const { pos, lines } = view;
  const safety = view.insights.filter((i) => i.area === 'safety');
  const rest = view.insights.filter((i) => i.area !== 'safety').slice(0, Math.max(0, 3 - safety.length));
  return (
    <div className="stack">
      <div>
        <div className="h-date">{formatLong(view.date)}</div>
        <PositionLines view={view} />
      </div>

      {backupOld && (
        <button className="banner" onClick={() => go('settings/backup')}>
          <CloudOff size={20} />
          <span className="grow" style={{ textAlign: 'left' }}>No backup for over 3 days. Tap to fix.</span>
          <ChevronRight size={18} />
        </button>
      )}

      {lines.startsOn && (
        <Card tone="ember" toned>
          <div className="label">The long road</div>
          <div className="big" style={{ color: 'var(--ember)', marginTop: 4 }}>{lines.startsOn}</div>
          <div className="small muted" style={{ marginTop: 6 }}>Block {pos.block.code} {pos.block.name} · Week 1 · {TPL_LABEL[pos.tpl]}</div>
        </Card>
      )}

      <CheckinCard view={view} />

      <RecoveryTodaySlot data={data} view={view} place="banner" />

      {safety.map((i) => (
        <InsightCard key={i.id} insight={i} date={view.date} />
      ))}

      <StepsMissing data={data} date={view.date} />

      <section className="section" aria-label="Training tasks">
        <SectionTitle right={<span className="small muted">{done(view.tasks.training)}</span>}>Training</SectionTitle>
        <Card>
          <div className="tasks">
            {view.tasks.training.map((t) => (
              <TaskRow key={t.id} task={t} date={view.date} data={data} />
            ))}
          </div>
        </Card>
      </section>

      <section className="section" aria-label="Mind tasks">
        <SectionTitle right={<span className="small muted">{done(view.tasks.mind)}</span>}>Mind</SectionTitle>
        <Card>
          <div className="tasks">
            {view.tasks.mind.length ? view.tasks.mind.map((t) => <TaskRow key={t.id} task={t} date={view.date} data={data} />) : <div className="muted small">Starts with season 1.</div>}
          </div>
        </Card>
      </section>

      <EatToday view={view} />

      <RecoveryTodaySlot data={data} view={view} place="goal" />

      {rest.length > 0 && (
        <section className="section" aria-label="Insights">
          <SectionTitle>Insights</SectionTitle>
          {rest.map((i) => (
            <InsightCard key={i.id} insight={i} date={view.date} />
          ))}
        </section>
      )}

      <Streak data={data} date={view.date} />
      <Runes />
    </div>
  );
}

const done = (tasks: Task[]) => `${tasks.filter((t) => t.done).length} / ${tasks.length}`;

export function PositionLines({ view }: { view: DayView }) {
  const { pos } = view;
  const season = SEASONS[pos.seasonIndex];
  return (
    <div className="stack tight" style={{ marginTop: 6 }}>
      <div className="chips">
        <Chip plain>Year {pos.year}</Chip>
        <Chip tone={TPL_TONE[pos.tpl]}>
          {pos.block.code} {pos.block.name}
        </Chip>
        <Chip plain>
          W{pos.week}/{pos.block.weeks} · {pos.weekType.name}
        </Chip>
        <Chip tone={PHASE_TONE[pos.block.phase]}>{PHASE_LABEL[pos.block.phase]}</Chip>
        <Chip plain>RIR {pos.weekType.rir}</Chip>
        <Chip tone={season.c}>
          {season.review ? 'Review' : `S${season.n} ${season.name}`} · {pos.seasonDay}/{pos.seasonLength}
        </Chip>
      </div>
      <div className="sr-only">
        {view.lines.position}. {view.lines.season}.
      </div>
    </div>
  );
}

function TaskRow({ task, date, data }: { task: Task; date: ISODate; data: Data }) {
  const day = data.days.get(date);
  const tone = task.tone;
  const onTick = (v: boolean) => {
    if (task.link && (task.auto || task.id === 'session')) {
      go(task.link.replace(/^#\//, ''));
      return;
    }
    if (task.id === 'checkin') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (task.auto) return;
    void toggleTask(date, task.id, v);
  };
  return (
    <div className={cx('task', task.done && 'done', `t-${tone}`)}>
      <Tick on={task.done} tone={tone} label={task.label} onChange={onTick} />
      <div className="body">
        <div className="title">
          {task.link ? (
            <a href={task.link} style={{ color: 'inherit', textDecoration: 'none' }}>
              {task.label}
            </a>
          ) : (
            task.label
          )}
          {task.tag && <span className="tag">{task.tag}</span>}
        </div>
        {(task.sub || task.why) && <div className="sub">{task.sub ?? task.why}</div>}
        {task.input === 'code' && <CodeTicks date={date} code={day?.code} />}
        {task.input === 'cardio' && <CardioInline date={date} task={task} />}
      </div>
      {task.input === 'steps' && <StepsInline date={date} value={day?.steps} progress={task.progress} />}
      {task.input === 'weight' && <BodyInline key={data.profile?.units} date={date} field="weightKg" data={data} />}
      {task.input === 'waist' && <BodyInline date={date} field="waistCm" data={data} />}
      {task.input === 'mobility' && <MobilityInline date={date} value={day?.mobilityMin} target={task.target ?? 10} />}
      {task.link && !task.input && <ChevronRight size={18} className="muted" aria-hidden="true" />}
    </div>
  );
}

function CodeTicks({ date, code }: { date: ISODate; code?: boolean[] }) {
  return (
    <div className="code-ticks">
      {DAILY_CODE.map((c, i) => (
        <button key={c} type="button" aria-pressed={!!code?.[i]} onClick={() => void toggleCode(date, i)}>
          {c}
        </button>
      ))}
    </div>
  );
}

function StepsInline({ date, value, progress }: { date: ISODate; value?: number; progress: number }) {
  const [v, setV] = useState<number | undefined>(value);
  return (
    <div className="inline">
      <NumInput value={v} onChange={setV} label="Steps from Garmin" placeholder="steps" />
      <button className="btn small" aria-label="Save steps" onClick={() => void setSteps(date, v)} disabled={v === value}>
        OK
      </button>
      <Ring value={progress} size={34} tone="moss" />
    </div>
  );
}

function BodyInline({ date, field, data }: { date: ISODate; field: 'weightKg' | 'waistCm'; data: Data }) {
  // Weight is typed in the chosen unit and stored in kg; the waist stays in cm.
  const u = unitsOf(data.profile);
  const isWeight = field === 'weightKg';
  const today = live(data.body).find((b) => b.date === date && b[field] != null);
  const stored = today?.[field];
  const initial = stored == null ? undefined : isWeight ? u.show(stored) : stored;
  const [v, setV] = useState<number | undefined>(initial);
  return (
    <div className="inline">
      <NumInput value={v} onChange={setV} unit={isWeight ? u.label : 'cm'} label={isWeight ? 'Weight' : 'Waist'} />
      <button className="btn small" disabled={v == null || v === initial} onClick={() => void logBodyToday(date, { [field]: isWeight ? u.fromDisplay(v as number) : v })}>
        OK
      </button>
    </div>
  );
}

function MobilityInline({ date, value, target }: { date: ISODate; value?: number; target: number }) {
  return (
    <div className="inline">
      <span className="num small" style={{ minWidth: 34, textAlign: 'right' }}>{value ?? 0}′</span>
      <button className="btn small" aria-label={`Add ${target} minutes of mobility`} onClick={() => void setMobility(date, (value ?? 0) + target)}>
        <Plus size={14} /> {target}
      </button>
    </div>
  );
}

function CardioInline({ date, task }: { date: ISODate; task: Task }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<CardioType>(task.cardio?.kind === 'walk' ? 'walk' : 'incline walk');
  const [min, setMin] = useState<number | undefined>(task.target);
  if (task.done && !open) return null;
  if (!open)
    return (
      <button className="link-btn" onClick={() => setOpen(true)}>
        Log it
      </button>
    );
  return (
    <div className="row wrap" style={{ marginTop: 6, gap: 6 }}>
      <select className="input" style={{ width: 'auto', minHeight: 38, fontSize: 15 }} value={type} onChange={(e) => setType(e.target.value as CardioType)} aria-label="Cardio type">
        {CARDIO_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <div style={{ width: 96 }}>
        <NumInput value={min} onChange={setMin} unit="min" label="Minutes" />
      </div>
      <button
        className="btn small frost"
        disabled={!min}
        onClick={async () => {
          await logCardio(date, type, min as number, task.cardio?.kind === 'zone2' || task.cardio?.kind === 'walk' || task.cardio?.kind === 'easy' ? 'easy' : 'moderate');
          setOpen(false);
        }}
      >
        Save
      </button>
    </div>
  );
}

function EatToday({ view }: { view: DayView }) {
  const t = view.targets;
  return (
    <section className="section" aria-label="Eat today">
      <SectionTitle>Eat today</SectionTitle>
      <Card tone="ember" toned>
        <div className="row between">
          <div>
            <div className="big" style={{ color: 'var(--ember)' }}>{fmtInt(t.kcal)}</div>
            <div className="label" style={{ marginTop: 4 }}>kcal{t.offset ? ` · ${t.offset > 0 ? '+' : ''}${t.offset} applied` : ''}</div>
          </div>
          <div className="row" style={{ gap: 14 }}>
            {[
              ['P', t.p, 'ember'],
              ['F', t.f, 'gold'],
              ['C', t.c, 'frost'],
            ].map(([k, v, tone]) => (
              <div key={k as string} className={`center t-${tone}`}>
                <div className="num tone" style={{ fontSize: 22 }}>{v}</div>
                <div className="label">{k} g</div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </section>
  );
}

/** Recent days with no steps: one tap opens the day to add them. */
function StepsMissing({ data, date }: { data: Data; date: ISODate }) {
  const days = stepsMissing(date, data);
  const id = `steps-missing:${days.join(',')}`;
  if (!days.length || data.dismissed.has(id)) return null;
  return (
    <Card tone="gold" toned>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <div style={{ fontWeight: 700 }}>Steps not logged</div>
          <div className="small muted" style={{ marginTop: 2 }}>Until you add them, these days count the steps task as missed.</div>
        </div>
        <button className="icon-btn" aria-label="Dismiss" onClick={() => void dismiss(id, date)} style={{ margin: '-10px -10px 0 0' }}>
          <X size={18} />
        </button>
      </div>
      <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
        {days.map((d) => (
          <button key={d} className="btn small" onClick={() => go(`today/${d}`)}>
            {weekdayShort(d)} {formatShort(d)}
          </button>
        ))}
      </div>
    </Card>
  );
}

/** A day already gone: everything that can still be logged for it, on one screen. */
function PastDay({ data, date, today }: { data: Data; date: ISODate; today: ISODate }) {
  const v = useMemo(() => computeDay(date, data, new Date(`${date}T12:00:00`)), [data, date]);
  const saved = data.days.get(date)?.readiness;
  const ago = diffDays(today, date);
  const next = addDays(date, 1);
  useLayoutEffect(() => window.scrollTo(0, 0), []);
  // A check-in added afterwards also gets its readiness snapshot (the colour in the strip); one already saved is kept.
  useEffect(() => {
    if (v.decision.readiness && !saved) void syncReadiness(v);
  }, [v, saved]);
  const training = v.tasks.training.filter((t) => t.id !== 'checkin');
  return (
    <div className="stack">
      <div className="row" style={{ gap: 4 }}>
        <button className="icon-btn" aria-label="Previous day" onClick={() => go(`today/${addDays(date, -1)}`)}>
          <ChevronLeft size={22} />
        </button>
        <div className="grow center">
          <div className="h-date">{formatLong(date)}</div>
          <div className="small muted">{ago === 1 ? 'Yesterday' : `${ago} days ago`}</div>
        </div>
        <button className="icon-btn" aria-label="Next day" onClick={() => go(next >= today ? 'today' : `today/${next}`)}>
          <ChevronRight size={22} />
        </button>
      </div>
      <div className="small muted">Forgot something? Fill it in here. Averages, the 14-day strip and habit scores update straight away.</div>

      <PastCheckin view={v} />

      <section className="section" aria-label="Training tasks">
        <SectionTitle right={<span className="small muted">{done(training)}</span>}>Training</SectionTitle>
        <Card>
          <div className="tasks">
            {training.map((t) => (t.id === 'session' ? <PastSession key={t.id} task={t} date={date} code={v.session.code} /> : <TaskRow key={t.id} task={t} date={date} data={data} />))}
          </div>
        </Card>
      </section>

      {v.tasks.mind.length > 0 && (
        <section className="section" aria-label="Mind tasks">
          <SectionTitle right={<span className="small muted">{done(v.tasks.mind)}</span>}>Mind</SectionTitle>
          <Card>
            <div className="tasks">
              {v.tasks.mind.map((t) => <TaskRow key={t.id} task={t} date={date} data={data} />)}
            </div>
          </Card>
        </section>
      )}

      <button className="btn block" onClick={() => go('today')}>Back to today</button>
    </div>
  );
}

function PastCheckin({ view }: { view: DayView }) {
  const [editing, setEditing] = useState(false);
  const c = view.checkin;
  if (c && !editing) {
    return (
      <Card>
        <div className="row between">
          <div className="small">
            <span className="label">Check-in</span> {formatSleep(c.sleepMin)} · score {c.sleepScore} · energy {c.energy}
          </div>
          <button className="link-btn row" style={{ gap: 4 }} onClick={() => setEditing(true)}>
            <Pencil size={14} /> Edit
          </button>
        </div>
      </Card>
    );
  }
  return (
    <Card toned tone="frost">
      <Fold title={<span className="label">Morning check-in{c ? '' : ' · not logged'}</span>} open={editing}>
        <CheckinForm date={view.date} initial={c} onDone={() => setEditing(false)} />
      </Fold>
    </Card>
  );
}

/** The session row of a past day: a tick marks it done, nothing else is filled in. */
function PastSession({ task, date, code }: { task: Task; date: ISODate; code: SessionCode | null }) {
  const onTick = (on: boolean) => {
    if (!code) void toggleTask(date, 'session', on);
    else void (on ? markSessionDone(date, code) : reopenSession(date));
  };
  return (
    <div className={cx('task', task.done && 'done', `t-${task.tone}`)}>
      <Tick on={task.done} tone={task.tone} label={task.label} onChange={onTick} />
      <div className="body">
        <div className="title">{task.label}</div>
        <div className="sub">{code ? (task.done ? 'Done' : 'Trained that day? Tick it. Weights are not added.') : task.sub}</div>
      </div>
    </div>
  );
}

function Streak({ data, date }: { data: Data; date: ISODate }) {
  const days = useMemo(() => {
    const out: { date: ISODate; tone: string; fill: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = addDays(date, -i);
      const rec = data.days.get(d);
      let fill = 0;
      if (rec) {
        const v = computeDay(d, data, new Date(`${d}T12:00:00`));
        fill = completion([...v.tasks.training, ...v.tasks.mind]);
      }
      const type = rec?.readiness?.type;
      out.push({ date: d, tone: type ? sessionTone(type) : 'ash', fill });
    }
    return out;
  }, [data, date]);
  return (
    <section className="section" aria-label="Last 14 days">
      <SectionTitle right={<span className="small muted">Tap a day to fill it in</span>}>Last 14 days</SectionTitle>
      <div className="streak">
        {days.map((d) => (
          <button
            key={d.date}
            type="button"
            className={cx('d', `t-${d.tone}`, d.date === date && 'today')}
            aria-label={`${formatLong(d.date)}: ${Math.round(d.fill * 100)}% done${d.date === date ? ', today' : ''}`}
            onClick={() => go(d.date === date ? 'today' : `today/${d.date}`)}
          >
            <div className="fill" style={{ height: `${Math.round(d.fill * 100)}%` }} />
          </button>
        ))}
      </div>
      <div className="streak-labels" aria-hidden="true">
        {days.map((d) => (
          <span key={d.date}>{weekdayShort(d.date).charAt(0)}</span>
        ))}
      </div>
      <div className="legend">
        <span className="t-moss"><i />Full or Moderate</span>
        <span className="t-gold"><i />Light or sparing</span>
        <span className="t-ember"><i />Recovery</span>
      </div>
    </section>
  );
}
