import { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Copy, Flag } from 'lucide-react';
import type { ScreenProps } from '../App';
import { addDays, formatMedium, formatShort, startOfWeek, weekdayShort } from '../engine/dates';
import { habitRate } from '../engine/insights';
import type { Data } from '../engine/model';
import { live } from '../engine/model';
import { pausesOf, realDateOf } from '../engine/position';
import { statsLines, weekStats, weekSuggestion } from '../engine/review';
import { unitsOf } from '../engine/units';
import { activeHabitSeasons, habitDue } from '../engine/tasks';
import type { DayView } from '../engine/today';
import { HABITS, SEASONS } from '../plan';
import { ARC, ASK_INSTRUCTION, LADDER, NEVER_CHANGES, PILLARS, PRESENCE, SUNDAY_QUESTIONS, SWAPS, VOICE, YEAR_THEMES } from '../plan/content';
import type { ISODate } from '../plan/types';
import { put } from '../db/store';
import { go, toast } from '../state/hooks';
import { copyText, openClaude } from '../ui/clipboard';
import { Card, Chip, cx, Fold, Maxim, Ring, Runes, SectionTitle, Seg, Sheet } from '../ui/kit';

export function Mind({ data, view, route }: ScreenProps) {
  const { pos } = view;
  const s = pos.season;
  const rate = s.n > 0 ? habitRate(s.n, pos.seasonStart, view.date, data) : null;
  const sunday = new Date(`${view.date}T12:00:00Z`).getUTCDay() === 0;
  const [reviewOpen, setReviewOpen] = useState(route[1] === 'review');
  const [seasonOpen, setSeasonOpen] = useState(route[1] === 'season');
  const close = (set: (v: boolean) => void) => () => {
    set(false);
    if (route[1]) go('mind');
  };

  return (
    <div className="stack">
      <Maxim />
      <Card tone={s.c} toned>
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div className="grow">
            <div className="label">{s.review ? `Review · Year ${s.year}` : `Season ${s.n} · ${s.pillar}`}</div>
            <div className="big" style={{ color: 'var(--tone)', fontSize: 30, marginTop: 4 }}>{s.name}</div>
          </div>
          {rate?.rate != null && <Ring value={rate.rate} size={56} stroke={5} tone={s.c} label={`${Math.round(rate.rate * 100)}%`} />}
        </div>
        <div style={{ fontWeight: 700, marginTop: 10 }}>{s.habit}</div>
        <div className="small" style={{ marginTop: 6, color: 'var(--tone)' }}>{s.when}</div>
        <div className="chips" style={{ marginTop: 10 }}>
          <Chip tone={s.c}>Day {pos.seasonDay} of {pos.seasonLength}</Chip>
          <Chip plain>{s.measure}</Chip>
          <Chip plain>{formatShort(pos.seasonStart)} → {formatShort(pos.seasonEnd)}</Chip>
        </div>
      </Card>

      <div className="grid2">
        <button className={cx('btn', sunday && 'primary')} onClick={() => setReviewOpen(true)}>
          <BookOpen size={16} /> Sunday review
        </button>
        <button className="btn" onClick={() => setSeasonOpen(true)}>
          <Flag size={16} /> Season scores
        </button>
      </div>

      <Habits data={data} view={view} />
      <Road view={view} data={data} />
      <Ladder year={pos.year} />
      <Reference />
      <a className="btn block ghost" href="#/about">About the plan: the evidence</a>
      <Runes />

      <SundayReview open={reviewOpen} onClose={close(setReviewOpen)} data={data} date={view.date} />
      <SeasonReview open={seasonOpen} onClose={close(setSeasonOpen)} data={data} view={view} />
    </div>
  );
}

function Habits({ data, view }: { data: Data; view: DayView }) {
  const ws = startOfWeek(view.date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const seasons = view.pos.status === 'before' ? [] : activeHabitSeasons(view.pos.planDate);
  return (
    <section className="section">
      <SectionTitle>Habits this week</SectionTitle>
      <Card>
        {seasons.length === 0 && <div className="muted small">The first habit starts with season 1.</div>}
        {seasons.map((n) => {
          const season = SEASONS.find((x) => x.n === n)!;
          const h = HABITS[n];
          const id = `habit:${n}`;
          const weekly = h.schedule === 'weekly';
          const weekDone = days.some((d) => data.days.get(d)?.tasks?.[id]);
          const r = habitRate(n, ws, view.date, data);
          return (
            <div key={n} className={cx('list-row', `t-${season.c}`)}>
              <div className="grow">
                <div style={{ fontWeight: 600, fontSize: 14 }}>{season.name} <span className="tiny muted">S{n}</span></div>
                <div className="tiny muted">{h.task}</div>
              </div>
              {weekly ? (
                <Chip tone={weekDone ? season.c : undefined} plain={!weekDone}>{weekDone ? 'Done this week' : 'This week'}</Chip>
              ) : (
                <div className="dots" aria-label={`${r.done} of ${r.due} days`}>
                  {days.map((d) => (
                    <i key={d} className={cx(data.days.get(d)?.tasks?.[id] && 'on', (!habitDue(n, d) || d > view.date) && 'na')} title={weekdayShort(d)} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </section>
  );
}

function Road({ view, data }: { view: DayView; data: Data }) {
  const pauses = pausesOf(data.plan);
  return (
    <section className="section">
      <SectionTitle>The road</SectionTitle>
      <div className="road">
        {[1, 2, 3, 4].map((y) => (
          <RoadYear key={y} y={y} view={view} pauses={pauses} />
        ))}
      </div>
      <div className="tiny muted">4 years, 16 seasons of 12 weeks, a review every autumn. One new habit at a time.</div>
    </section>
  );
}

function RoadYear({ y, view, pauses }: { y: number; view: DayView; pauses: ReturnType<typeof pausesOf> }) {
  const seasons = SEASONS.map((s, i) => ({ s, i })).filter(({ s }) => s.year === y);
  return (
    <>
      <div className="y" title={YEAR_THEMES[y]}>Y{y}</div>
      {seasons.map(({ s, i }) => {
        const end = realDateOf(s.end, pauses);
        return (
          <div key={i} className={cx('s', `t-${s.c}`, i === view.pos.seasonIndex && 'now', end < view.date && 'past')}>
            <b>{s.review ? 'Review' : s.name}</b>
            <span className="muted">{s.review ? 'Look back' : s.pillar}</span>
          </div>
        );
      })}
    </>
  );
}

function Ladder({ year }: { year: number }) {
  return (
    <section className="section">
      <SectionTitle>Practice ladder</SectionTitle>
      <div className="ladder">
        <div className="lh" />
        {[1, 2, 3, 4].map((y) => (
          <div key={y} className="lh">Y{y}</div>
        ))}
        {LADDER.map((row) => (
          <Row key={row.name} row={row} year={year} />
        ))}
      </div>
    </section>
  );
}

function Row({ row, year }: { row: (typeof LADDER)[number]; year: number }) {
  return (
    <>
      <div className={cx('ln', `t-${row.tone}`)}>{row.name}</div>
      {row.years.map((v, i) => (
        <div key={i} className={cx(`t-${row.tone}`, i + 1 === year && 'cur')}>{v}</div>
      ))}
    </>
  );
}

function Reference() {
  return (
    <section className="section">
      <SectionTitle>Who he becomes</SectionTitle>
      <Card>
        <Fold title={<b>The arc</b>} open>
          <div className="stack tight" style={{ paddingBottom: 10 }}>
            {ARC.map((a, i) => (
              <div key={a.stage} className={cx('row', `t-${a.tone}`)} style={{ alignItems: 'flex-start' }}>
                <span className="num tone" style={{ width: 24 }}>0{i + 1}</span>
                <div className="grow">
                  <b className="tone">{a.stage}</b>
                  <div className="tiny muted">{a.lines.join(' · ')}</div>
                </div>
                {i === ARC.length - 1 && <Chip tone="moss" solid>Target</Chip>}
              </div>
            ))}
          </div>
        </Fold>
        <Fold title={<b>The four pillars</b>}>
          <div className="stack tight" style={{ paddingBottom: 10 }}>
            {PILLARS.map((p) => (
              <Card key={p.name} tone={p.tone} toned>
                <div className="row between">
                  <b className="tone" style={{ fontFamily: 'var(--head)', fontSize: 18 }}>{p.name}</b>
                  <span className="small">{p.rule}</span>
                </div>
                <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {p.reps.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </Card>
            ))}
          </div>
        </Fold>
        <Fold title={<b>What changes</b>}>
          <div className="stack tight" style={{ paddingBottom: 10 }}>
            {SWAPS.map(([a, b]) => (
              <div key={a} className="row small">
                <span className="grow muted" style={{ textDecoration: 'line-through', textDecorationColor: 'rgba(165,157,142,.5)' }}>{a}</span>
                <ArrowRight size={14} className="muted" />
                <span className="grow" style={{ color: 'var(--gold)' }}>{b}</span>
              </div>
            ))}
          </div>
        </Fold>
        <Fold title={<b>What never changes</b>}>
          <div className="chips" style={{ paddingBottom: 10 }}>
            {NEVER_CHANGES.map((n, i) => <Chip key={n} tone={(['frost', 'ember', 'gold', 'moss'] as const)[i % 4]}>{n}</Chip>)}
          </div>
        </Fold>
        <Fold title={<b>Voice</b>}>
          <div className="stack tight" style={{ paddingBottom: 10 }}>
            <div className="chips">{VOICE.how.map((v) => <Chip key={v} tone="frost">{v}</Chip>)}</div>
            <div className="label">Daily drill, 5 min</div>
            <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>{VOICE.drill.map((d) => <li key={d}>{d}</li>)}</ol>
            {VOICE.notes.map((n) => <div key={n} className="tiny muted">{n}</div>)}
          </div>
        </Fold>
        <Fold title={<b>Presence</b>}>
          <div className="stack tight" style={{ paddingBottom: 10 }}>
            <div className="label">Stance</div>
            <div className="chips">{PRESENCE.stance.map((v) => <Chip key={v} tone="frost">{v}</Chip>)}</div>
            <div className="label">Walk</div>
            <div className="chips">{PRESENCE.walk.map((v) => <Chip key={v} tone="ember">{v}</Chip>)}</div>
            <div className="label">With people</div>
            <div className="chips">{PRESENCE.people.map((v) => <Chip key={v} tone="gold">{v}</Chip>)}</div>
          </div>
        </Fold>
      </Card>
    </section>
  );
}

function SundayReview({ open, onClose, data, date }: { open: boolean; onClose: () => void; data: Data; date: ISODate }) {
  const ws = startOfWeek(date);
  const existing = live(data.reviews).find((r) => r.id === ws);
  const [answers, setAnswers] = useState<string[]>(existing?.answers ?? ['', '', '']);
  const stats = useMemo(() => weekStats(date, data), [date, data]);
  const suggestion = weekSuggestion(stats);
  const lines = statsLines(stats, unitsOf(data.profile));
  const history = live(data.reviews).filter((r) => r.id !== ws).sort((a, b) => (a.id < b.id ? 1 : -1));
  const save = async () => {
    await put('reviews', { id: ws, answers, stats: Object.fromEntries(lines), suggestion });
    toast('Review saved');
    onClose();
  };
  const copy = async () => {
    const text = [
      ASK_INSTRUCTION,
      '',
      `My week starting ${formatMedium(ws)}. Write me a short summary: what went well, what to watch, one focus for next week.`,
      ...lines.map(([k, v]) => `${k}: ${v}`),
      `Engine suggestion: ${suggestion}`,
      ...SUNDAY_QUESTIONS.map((q, i) => `${q} ${answers[i] || '(no answer)'}`),
    ].join('\n');
    if (await copyText(text)) {
      toast('Copied. Paste it in Claude.');
      openClaude();
    } else toast('Copy failed. Select and copy by hand.');
  };
  return (
    <Sheet open={open} title="Sunday review" onClose={onClose}>
      <div className="stack">
        {SUNDAY_QUESTIONS.map((q, i) => (
          <label key={q} className="field">
            <span>{q}</span>
            <textarea className="input" value={answers[i]} onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))} rows={2} />
          </label>
        ))}
        <Card>
          <div className="label" style={{ marginBottom: 6 }}>This week</div>
          <div className="grid2 small">
            {lines.map(([k, v]) => (
              <div key={k}><span className="muted">{k}</span><br /><b>{v}</b></div>
            ))}
          </div>
        </Card>
        <Card tone="gold" tint>
          <div className="label">Next week</div>
          <div style={{ marginTop: 4 }}>{suggestion}</div>
        </Card>
        <div className="grid2">
          <button className="btn" onClick={() => void copy()}><Copy size={16} /> Copy my week for Claude</button>
          <button className="btn primary" onClick={() => void save()}>Save</button>
        </div>
        {history.length > 0 && (
          <Fold title={<span className="label">Past reviews</span>}>
            <div className="stack tight" style={{ paddingBottom: 10 }}>
              {history.map((r) => (
                <Card key={r.id}>
                  <div className="label">Week of {formatMedium(r.id)}</div>
                  {SUNDAY_QUESTIONS.map((q, i) => r.answers[i] ? <div key={q} className="small"><span className="muted">{q}</span> {r.answers[i]}</div> : null)}
                  {r.suggestion && <div className="tiny" style={{ color: 'var(--gold)', marginTop: 4 }}>{r.suggestion}</div>}
                </Card>
              ))}
            </div>
          </Fold>
        )}
      </div>
    </Sheet>
  );
}

function SeasonReview({ open, onClose, data, view }: { open: boolean; onClose: () => void; data: Data; view: DayView }) {
  const { pos } = view;
  const seasonIndex = pos.season.review ? pos.seasonIndex - 1 : pos.seasonIndex;
  const season = SEASONS[seasonIndex];
  const habits = activeHabitSeasons(season?.start ?? pos.planDate).filter((n) => n !== 16 || season.n === 16);
  const scores = new Map(live(data.seasonScores).filter((s) => s.seasonIndex === seasonIndex).map((s) => [s.habitSeason, s.score]));
  const set = (n: number, score: number) => put('seasonScores', { id: `${seasonIndex}:${n}`, seasonIndex, habitSeason: n, habit: SEASONS.find((x) => x.n === n)!.name, score });
  const earlier = SEASONS.map((s, i) => ({ s, i })).filter(({ s, i }) => s.n > 0 && i < seasonIndex && live(data.seasonScores).some((x) => x.seasonIndex === i));
  return (
    <Sheet open={open} title={`Season scores${season && season.n > 0 ? ` · ${season.name}` : ''}`} onClose={onClose}>
      <div className="stack">
        <div className="small muted">How automatic does each habit feel, 1 to 10? Under 6 keeps the focus next season.</div>
        {habits.map((n) => {
          const sn = SEASONS.find((x) => x.n === n)!;
          const v = scores.get(n);
          return (
            <div key={n} className={`t-${sn.c}`}>
              <div className="row between" style={{ marginBottom: 6 }}>
                <b className="tone">{sn.name}</b>
                {v != null && v < 6 && <Chip tone="gold">Keep focus next season</Chip>}
              </div>
              <Seg label={`${sn.name} score`} tone={sn.c} wrap value={v} onChange={(x) => void set(n, x)} options={Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: i + 1 }))} />
            </div>
          );
        })}
        {earlier.length > 0 && (
          <Fold title={<span className="label">Earlier seasons</span>}>
            <div className="stack tight" style={{ paddingBottom: 10 }}>
              {earlier.map(({ s, i }) => (
                <div key={i} className="small">
                  <b>{s.name}</b>{' '}
                  <span className="muted">{live(data.seasonScores).filter((x) => x.seasonIndex === i).map((x) => `${x.habit} ${x.score}`).join(' · ')}</span>
                </div>
              ))}
            </div>
          </Fold>
        )}
        <button className="btn primary block" onClick={onClose}>Done</button>
      </div>
    </Sheet>
  );
}
