import { useMemo, useState } from 'react';
import { Check, Minus, Pause, Plane, Plus } from 'lucide-react';
import type { ScreenProps } from '../App';
import { addDays, diffDays, formatShort, startOfWeek, weekdayName, weekdayShort } from '../engine/dates';
import { e1rmFor } from '../engine/loads';
import { unitsOf } from '../engine/units';
import type { Data, Feel, Mark } from '../engine/model';
import { live } from '../engine/model';
import { getPosition, pausesOf } from '../engine/position';
import { scheduledCode } from '../engine/schedule';
import { buildSession, dayTemplate, modsForType, type PlannedExercise, type SessionPlan } from '../engine/session';
import type { DayView } from '../engine/today';
import { BLOCKS, LIFTS, PHASE_LABEL, PHASE_TONE, SESSION_TONE, TPL_LABEL, TPL_TONE } from '../plan';
import { BACK_RESET, MOBILITY_DAILY } from '../plan/content';
import { takesLoad } from '../plan/exercises';
import type { ISODate, LiftKey } from '../plan/types';
import { finishSession, logCardio, logExercise, markExercise, pausePlan, reopenSession, resumePlan, setMobility, setTravel, tickSet, unlogExercise } from '../state/actions';
import { go, startRest } from '../state/hooks';
import { Card, Chip, Fold, NumInput, Seg, Sheet, SectionTitle, Tick, Toggle, Why, cx } from '../ui/kit';
import { DecisionBadge, InsightCard } from './parts';

const restText = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`);
export const doseText = (e: { sets: number; reps: number | string | null; work_s?: number; perSide?: boolean; loadNote?: string }) => {
  if (e.reps != null) return `${e.sets} × ${e.reps}${e.perSide ? ' /side' : ''}`;
  if (e.work_s && e.work_s >= 120) return `${e.sets} rounds`;
  return `${e.sets} sets`;
};

export function Train({ data, view, route }: ScreenProps) {
  const { session } = view;
  const [pauseOpen, setPauseOpen] = useState(route[1] === 'pause');
  const day = data.days.get(view.date);
  const sessionInsights = view.insights.filter((i) => i.area === 'session' || i.area === 'safety');
  const adjustments = useMemo(() => {
    const out: string[] = [];
    for (const lift of session.feedbackLifts) {
      const info = e1rmFor(lift, view.date, data);
      for (const a of info?.adjustments ?? []) out.push(`${LIFTS[lift].short} ${a.pct > 0 ? '+' : ''}${a.pct}%: ${a.reason}`);
    }
    return out;
  }, [data, session.feedbackLifts, view.date]);

  return (
    <div className="stack">
      <DecisionBadge view={view} />
      {sessionInsights.slice(0, 3).map((i) => (
        <InsightCard key={i.id} insight={i} date={view.date} />
      ))}

      <BlockCard view={view} />

      <Card>
        <Toggle on={!!day?.travelMode} onChange={(v) => void setTravel(view.date, v)} tone="gold" label="Travel mode today" sub="Hotel session. The plan does not move." />
        <div className="row between" style={{ marginTop: 4 }}>
          <div>
            <div style={{ fontWeight: 600 }}>Pause plan</div>
            <div className="tiny muted">Illness, travel week, life. The map slides.</div>
          </div>
          <button className="btn small" onClick={() => setPauseOpen(true)}>
            <Pause size={16} /> Pause
          </button>
        </div>
      </Card>

      <SessionCard view={view} data={data} />

      {adjustments.length > 0 && (
        <Card tone="moss" tint>
          <div className="label">Adjusted from your feedback</div>
          <div className="chips" style={{ marginTop: 6 }}>
            {adjustments.map((a) => (
              <Chip key={a} tone="moss">{a}</Chip>
            ))}
          </div>
        </Card>
      )}

      <CardioMobility view={view} data={data} />
      <RestOfWeek view={view} data={data} />
      <NextBlock view={view} />
      <PauseSheet open={pauseOpen} onClose={() => { setPauseOpen(false); if (route[1] === 'pause') go('train'); }} data={data} date={view.date} />
    </div>
  );
}

function BlockCard({ view }: { view: DayView }) {
  const { pos } = view;
  const b = pos.block;
  return (
    <Card tone={TPL_TONE[pos.tpl]} toned>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="label">Block {b.code} · Year {pos.year}</div>
          <div className="big" style={{ fontSize: 28, marginTop: 4 }}>{b.name}</div>
          <div className="small muted" style={{ marginTop: 4 }}>{formatShort(pos.blockStart)} → {formatShort(pos.blockEnd)}</div>
        </div>
        <div className="center">
          <div className="num" style={{ fontSize: 30 }}>W{pos.week}</div>
          <div className="tiny muted">of {b.weeks}</div>
        </div>
      </div>
      <div className="chips" style={{ marginTop: 10 }}>
        <Chip tone={TPL_TONE[pos.tpl]} solid>{TPL_LABEL[pos.tpl]}</Chip>
        <Chip tone={PHASE_TONE[b.phase]}>{PHASE_LABEL[b.phase]}</Chip>
        <Chip plain>{pos.weekType.name}</Chip>
        <Chip tone="ember">RIR {pos.weekType.rir}</Chip>
        {b.test && <Chip tone="gold">3RM test W6</Chip>}
      </div>
    </Card>
  );
}

function SessionCard({ view, data }: { view: DayView; data: Data }) {
  const s = view.session;
  const day = data.days.get(view.date);
  const [finishing, setFinishing] = useState(false);
  if (!s.code || s.mods.recovery) {
    return (
      <Card tone={s.tone} toned>
        <div className="label">{s.kind}</div>
        <div className="big" style={{ fontSize: 28, marginTop: 4 }}>{s.title}</div>
        <div className="small muted" style={{ marginTop: 6 }}>{s.focus}</div>
        {s.notes.length > 0 && (
          <ul className="small" style={{ margin: '10px 0 0', paddingLeft: 18 }}>
            {s.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        )}
      </Card>
    );
  }
  const doneCount = s.exercises.filter((e) => isDone(e, view.date, data)).length;
  return (
    <section className="section" aria-label="Today's session" style={{ marginTop: 6 }}>
      <Card className="flat">
        <div className={cx('band', `t-${s.tone}`)}>
          <div>
            <div className="k">{weekdayName(view.date)} · {s.kind}</div>
            <div className="n">{s.title}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="k">{doneCount}/{s.exercises.length} done</div>
            <div className="k">{s.exercises.reduce((n, e) => n + e.sets, 0)} sets</div>
          </div>
        </div>
        <div style={{ padding: '10px 14px 4px' }} className="small muted">
          {s.focus}
          {s.notes.map((n) => <div key={n} style={{ color: 'var(--gold)', marginTop: 4 }}>{n}</div>)}
        </div>
        {s.exercises.map((ex) => (
          <ExerciseRow key={`${ex.key}:${data.profile?.units ?? 'kg'}`} ex={ex} date={view.date} data={data} />
        ))}
        {s.skipped.length > 0 && (
          <div className="ex skipped">
            <div className="label">Skipped today</div>
            {s.skipped.map((k) => (
              <div key={k.name} className="small">{k.name} · <span className="muted">{k.why}</span></div>
            ))}
          </div>
        )}
        <div style={{ padding: 14 }}>
          {day?.sessionDone ? (
            <div className="row between">
              <Chip tone="moss"><Check size={14} /> Session done{day.feedback?.rpe ? ` · RPE ${day.feedback.rpe}` : ''}</Chip>
              <button className="link-btn" onClick={() => void reopenSession(view.date)}>Reopen</button>
            </div>
          ) : (
            <button className="btn primary block" onClick={() => setFinishing(true)}>
              <Check size={18} /> Finish session
            </button>
          )}
          <div className="tiny muted center" style={{ marginTop: 8 }}>Logging is never required. Skipped exercises count at the suggested weight.</div>
        </div>
      </Card>
      <FeedbackSheet open={finishing} onClose={() => setFinishing(false)} plan={s} view={view} />
    </section>
  );
}

const loggedToday = (name: string, date: ISODate, data: Data) => live(data.weights).find((w) => w.date === date && w.exercise === name && !w.assumed);
const isDone = (ex: PlannedExercise, date: ISODate, data: Data) => {
  if (loggedToday(ex.name, date, data)) return true;
  return (data.days.get(date)?.session?.[ex.key] ?? 0) >= ex.sets;
};

function ExerciseRow({ ex, date, data }: { ex: PlannedExercise; date: ISODate; data: Data }) {
  const logged = loggedToday(ex.name, date, data);
  const setsDone = data.days.get(date)?.session?.[ex.key] ?? 0;
  const hasLoad = takesLoad(ex.equipment) && ex.role !== 'test';
  // The field shows the chosen unit; logs are stored in kg.
  const u = unitsOf(data.profile);
  const step = u.step(ex.equipment);
  const suggested = ex.load?.kg != null ? u.show(ex.load.kg) : undefined;
  const [shown, setShown] = useState<number | undefined>(logged ? u.show(logged.kg) : suggested);
  const done = !!logged || setsDone >= ex.sets;
  const tone = ex.role === 'test' ? 'ember' : ex.role === 'finisher' ? 'gold' : undefined;

  const tickSetAt = (i: number) => {
    const next = setsDone > i ? i : i + 1;
    void tickSet(date, ex.key, next);
    if (next > setsDone && next < ex.sets) startRest(ex.rest_s, `${ex.name} · set ${next} of ${ex.sets}`);
    if (next >= ex.sets && hasLoad && !logged && shown != null) void logExercise(date, ex, u.fromDisplay(shown));
  };
  const tickExercise = (on: boolean) => {
    if (hasLoad && (shown != null || logged)) {
      if (on && shown != null) void logExercise(date, ex, u.fromDisplay(shown));
      else if (!on) void unlogExercise(date, ex.name);
    } else void tickSet(date, ex.key, on ? ex.sets : 0);
  };
  const mark = (m: Mark) => void markExercise(date, ex.name, logged?.mark === m ? null : m);

  return (
    <div className={cx('ex', done && 'done', tone && `t-${tone}`)}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Tick on={done} label={`${ex.name} done`} tone={tone ?? 'moss'} onChange={tickExercise} />
        <div className="grow">
          <div className="name">{ex.name}</div>
          {ex.originalName !== ex.name && <div className="orig">Garmin: {ex.originalName}</div>}
        </div>
        <div>
          <div className="dose">{doseText(ex)}</div>
          <div className="rest">{ex.rest_s ? `Rest ${restText(ex.rest_s)}` : ex.restNote ?? ''}</div>
        </div>
      </div>
      <div className="chips">
        {ex.role !== 'test' && ex.role !== 'finisher' && <Chip tone="ember">RIR {ex.rir}</Chip>}
        {ex.loadNote && <Chip plain>{ex.loadNote}</Chip>}
        {ex.role === 'finisher' && <Chip tone="gold">Finisher</Chip>}
        {ex.conditional && <Chip tone="gold">{ex.conditional}</Chip>}
        {ex.changes.map((c) => <Chip key={c} tone="frost">{c}</Chip>)}
      </div>
      {ex.note && <div className="small muted">{ex.note}</div>}
      {(hasLoad || ex.load?.kg != null) && (
        <div className="loadrow">
          {hasLoad && (
            <div className="kg">
              <button aria-label="Lighter" onClick={() => setShown(Math.max(0, Math.round(((shown ?? suggested ?? 0) - step) * 100) / 100))}>
                <Minus size={18} />
              </button>
              <NumInput value={shown} onChange={setShown} label={`${ex.name} weight`} placeholder={u.label} />
              <button aria-label="Heavier" onClick={() => setShown(Math.round(((shown ?? suggested ?? 0) + step) * 100) / 100)}>
                <Plus size={18} />
              </button>
            </div>
          )}
          <span className="tiny muted">{ex.load?.added ? `${u.label} added` : u.label}</span>
          {!hasLoad && ex.load?.kg != null && <span className="num">{u.w(ex.load.kg)}</span>}
          {ex.load?.badgeText && (
            <Chip tone={ex.load.badge === 'up' ? 'moss' : ex.load.badge === 'down' ? 'ember' : 'gold'} title={ex.load.badgeReason}>
              {ex.load.badgeText}
            </Chip>
          )}
          {ex.load?.badge === 'hold' && !ex.load.badgeText && <Chip tone="gold">Hold</Chip>}
          {ex.load?.badgeReason && <span className="tiny muted">{ex.load.badgeReason}</span>}
        </div>
      )}
      {ex.load && ex.load.why.length > 0 && <Why lines={ex.load.why} label="Why this load?" />}
      {ex.sets > 1 && (
        <div className="sets" role="group" aria-label="Sets">
          {Array.from({ length: ex.sets }, (_, i) => (
            <button key={i} className={cx('setdot', i < setsDone && 'on')} aria-pressed={i < setsDone} aria-label={`Set ${i + 1}`} onClick={() => tickSetAt(i)}>
              {i + 1}
            </button>
          ))}
        </div>
      )}
      {hasLoad && logged && (
        <div className="marks">
          <button className="btn small clean" aria-pressed={logged.mark === 'clean'} onClick={() => mark('clean')}>
            Clean
          </button>
          <button className="btn small hard" aria-pressed={logged.mark === 'hard'} onClick={() => mark('hard')}>
            Hard
          </button>
        </div>
      )}
    </div>
  );
}

const FEELS: { value: Feel; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'right', label: 'Right' },
  { value: 'hard', label: 'Hard' },
];

function FeedbackSheet({ open, onClose, plan, view }: { open: boolean; onClose: () => void; plan: SessionPlan; view: DayView }) {
  const [rpe, setRpe] = useState<number | undefined>();
  const [lifts, setLifts] = useState<Partial<Record<LiftKey, Feel>>>({});
  return (
    <Sheet open={open} title="How was it?" onClose={onClose}>
      <div className="stack">
        <div>
          <div className="label" style={{ marginBottom: 6 }}>Session effort · RPE</div>
          <Seg label="Session RPE, 1 to 10" tone={rpe != null && rpe >= 9 ? 'ember' : 'frost'} wrap value={rpe} onChange={setRpe} options={Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: i + 1 }))} />
        </div>
        {plan.feedbackLifts.map((l) => (
          <div key={l}>
            <div className="label" style={{ marginBottom: 6 }}>{LIFTS[l].short} at RIR {view.pos.weekType.rir}</div>
            <Seg label={`${LIFTS[l].short} felt`} tone="moss" value={lifts[l]} onChange={(v) => setLifts({ ...lifts, [l]: v })} options={FEELS} />
          </div>
        ))}
        <button
          className="btn primary block"
          onClick={async () => {
            await finishSession(view.date, plan, view, rpe, lifts);
            onClose();
          }}
        >
          Save
        </button>
        <div className="tiny muted center">Easy twice raises that lift 2.5%. Hard twice lowers it.</div>
      </div>
    </Sheet>
  );
}

function CardioMobility({ view, data }: { view: DayView; data: Data }) {
  const s = view.session;
  const day = data.days.get(view.date);
  const routine = s.mobility.routine === 'backReset' ? BACK_RESET : MOBILITY_DAILY;
  const warning = (routine as { warning?: string }).warning;
  const cardioToday = live(data.cardio).filter((c) => c.date === view.date).reduce((n, c) => n + c.minutes, 0);
  return (
    <section className="section">
      <SectionTitle>Cardio and mobility</SectionTitle>
      {[...s.cardio, ...(view.cardio.rx ? [view.cardio.rx] : [])].map((rx) => (
        <Card key={rx.id} tone="frost" toned>
          <div className="row between">
            <div>
              <div style={{ fontWeight: 700 }}>{rx.label}</div>
              <div className="tiny muted">{rx.optional ? 'Optional · ' : ''}{rx.why ?? 'Talk-test pace: you can still talk in full sentences.'}</div>
            </div>
            <Chip tone={cardioToday >= rx.minutes ? 'moss' : 'frost'}>{cardioToday}/{rx.minutes} min</Chip>
          </div>
          {cardioToday < rx.minutes && (
            <button className="btn small frost" style={{ marginTop: 8 }} onClick={() => void logCardio(view.date, rx.kind === 'walk' ? 'walk' : 'incline walk', rx.minutes - cardioToday, 'easy')}>
              Log {rx.minutes - cardioToday} min done
            </button>
          )}
        </Card>
      ))}
      <Card tone="moss" toned>
        <div className="row between">
          <div>
            <div style={{ fontWeight: 700 }}>{routine.title} · {routine.minutes} min</div>
            {warning && <div className="tiny" style={{ color: 'var(--gold)' }}>{warning}</div>}
          </div>
          <button className="btn small" onClick={() => void setMobility(view.date, (day?.mobilityMin ?? 0) + routine.minutes)}>
            <Check size={14} /> {day?.mobilityMin ?? 0} min
          </button>
        </div>
        <ul className="small" style={{ margin: '10px 0 0', paddingLeft: 18 }}>
          {routine.drills.map((d) => (
            <li key={d.name}>{d.name} <span className="muted">{d.dose}</span></li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

function RestOfWeek({ view, data }: { view: DayView; data: Data }) {
  const days = useMemo(() => {
    const start = startOfWeek(view.date);
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      const pos = getPosition(d, data.plan);
      const code = pos.status === 'active' ? scheduledCode(d, data) : null;
      const plan = code ? buildSession({ date: d, code, pos, mods: modsForType('Full'), data }) : null;
      return { d, code, plan, done: !!data.days.get(d)?.sessionDone };
    });
  }, [data, view.date]);
  return (
    <section className="section">
      <SectionTitle>This week</SectionTitle>
      <Card>
        {days.map(({ d, code, plan, done }) => (
          <Fold
            key={d}
            title={
              <div className="row">
                <span className="tiny muted" style={{ width: 30 }}>{weekdayShort(d)}</span>
                {code ? <Chip tone={SESSION_TONE[code]} solid={d === view.date}>{code}</Chip> : <Chip plain>Rest · walk</Chip>}
                {plan && <span className="tiny muted">{plan.kind}</span>}
                {done && <Check size={14} color="var(--moss)" aria-label="done" />}
              </div>
            }
          >
            {plan ? (
              <ul className="small" style={{ margin: '0 0 10px', paddingLeft: 18 }}>
                {plan.exercises.map((e) => (
                  <li key={e.key}>{e.name} <span className="muted">{doseText(e)}</span></li>
                ))}
              </ul>
            ) : (
              <div className="small muted" style={{ paddingBottom: 10 }}>Walk only.</div>
            )}
          </Fold>
        ))}
      </Card>
    </section>
  );
}

function NextBlock({ view }: { view: DayView }) {
  const next = BLOCKS[view.pos.blockIndex + 1];
  if (!next) return null;
  const codes = ['BLADES', 'LEVIATHAN', 'GUARDIAN', 'SPARTAN', 'DRAUPNIR', 'VALHALLA'] as const;
  const inDays = diffDays(addDays(view.pos.blockEnd, 1), view.date);
  return (
    <section className="section">
      <SectionTitle>Next block</SectionTitle>
      <Card tone={TPL_TONE[next.tpl]} toned>
        <Fold
          title={
            <div>
              <div style={{ fontWeight: 700 }}>{next.code} {next.name}</div>
              <div className="chips" style={{ marginTop: 4 }}>
                <Chip tone={TPL_TONE[next.tpl]}>{TPL_LABEL[next.tpl]}</Chip>
                <Chip tone={PHASE_TONE[next.phase]}>{PHASE_LABEL[next.phase]}</Chip>
                <Chip plain>in {inDays} days</Chip>
              </div>
            </div>
          }
        >
          <div className="stack tight" style={{ paddingBottom: 6 }}>
            {codes.map((c) => {
              const { day } = dayTemplate(c, next.tpl);
              return (
                <div key={c} className="row small">
                  <Chip tone={SESSION_TONE[c]}>{c}</Chip>
                  <span className="muted">{day.kind}</span>
                </div>
              );
            })}
            <div className="tiny muted">{next.kcal.toLocaleString('en-US')} kcal · P {next.p} · F {next.f} · C {next.c}</div>
          </div>
        </Fold>
      </Card>
    </section>
  );
}

function PauseSheet({ open, onClose, data, date }: { open: boolean; onClose: () => void; data: Data; date: ISODate }) {
  const [days, setDays] = useState<number | undefined>(7);
  const pauses = data.plan.filter((e): e is Extract<typeof e, { kind: 'pause' }> => e.kind === 'pause' && !e.deleted).sort((a, b) => (a.date < b.date ? 1 : -1));
  const active = pauses.find((p) => date >= p.date && diffDays(date, p.date) < p.days);
  const total = pausesOf(data.plan).reduce((s, p) => s + p.days, 0);
  return (
    <Sheet open={open} title="Pause plan" onClose={onClose}>
      <div className="stack">
        <div className="small muted">Every future block and season moves by the days you pause. Whole weeks keep blocks starting on Monday.</div>
        {active ? (
          <Card tone="gold" tint>
            <div style={{ fontWeight: 700 }}>Paused since {formatShort(active.date)} for {active.days} days</div>
            <button className="btn block" style={{ marginTop: 10 }} onClick={() => void resumePlan(active.id, active.date, date).then(onClose)}>
              Resume today
            </button>
          </Card>
        ) : (
          <>
            <Seg label="Days to pause" tone="gold" value={days} onChange={setDays} options={[3, 7, 14, 21].map((v) => ({ value: v, label: `${v} d` }))} />
            <NumInput value={days} onChange={setDays} unit="days" label="Days to pause" />
            <button className="btn primary block" disabled={!days || days < 1 || days > 90} onClick={() => void pausePlan(date, days as number).then(onClose)}>
              <Plane size={16} /> Pause {days ?? ''} days from today
            </button>
          </>
        )}
        <div className="tiny muted">Total paused so far: {total} days.</div>
      </div>
    </Sheet>
  );
}

