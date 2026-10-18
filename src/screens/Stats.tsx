import { useMemo, useState } from 'react';
import { Lock, Trophy } from 'lucide-react';
import type { ScreenProps } from '../App';
import { addDays, formatMedium, formatSleep, formatShort, startOfWeek } from '../engine/dates';
import { fmtKg, round1 } from '../engine/formulas';
import { habitRate } from '../engine/insights';
import type { Data } from '../engine/model';
import { live } from '../engine/model';
import { pausesOf, realDateOf } from '../engine/position';
import { sessionTone } from '../engine/readiness';
import { bodyFatSeries, bodyFatTargets, e1rmSeries, exerciseNames, leanSeries, personalRecords, phaseBands, standardText, standardValues, targetSeries, weightAverageSeries, workingWeightSeries, type Pt } from '../engine/stats';
import { trophies } from '../engine/trophies';
import type { DayView } from '../engine/today';
import { unitsOf, type Units } from '../engine/units';
import { LIFTS, PLAN_START, ROAD_WEEKS, SEASONS, STAT_LIFTS, STEPS_GOAL, TPL_TONE } from '../plan';
import { STANDARDS } from '../plan/content';
import type { ISODate, LiftKey } from '../plan/types';
import { BarChart, LineChart } from '../ui/charts';
import { Card, Chip, Empty, Runes, Seg, SectionTitle, cx } from '../ui/kit';

type Range = '12w' | 'year' | 'all';

/** Chart points are stored in kg; draw them in the chosen unit. */
const inUnit = (pts: Pt[], u: Units): Pt[] => (u.unit === 'kg' ? pts : pts.map((p) => ({ ...p, y: u.toDisplay(p.y) })));

export function Stats({ data, view }: ScreenProps) {
  const [range, setRange] = useState<Range>('12w');
  const today = view.date;
  const earliest = addDays(PLAN_START, -7);
  const back = range === '12w' ? addDays(today, -84) : range === 'year' ? addDays(today, -365) : earliest;
  const from = back < earliest ? earliest : back;
  const to = addDays(today, range === '12w' ? 28 : 56);
  return (
    <div className="stack">
      <RoadProgress view={view} />
      <Seg label="Chart range" tone="frost" value={range} onChange={setRange} options={[{ value: '12w', label: '12 weeks' }, { value: 'year', label: 'Year' }, { value: 'all', label: 'All' }]} />
      <Weight data={data} from={from} to={to} today={today} />
      <BodyFat data={data} from={from} to={to} />
      <Strength data={data} />
      <WorkingWeight data={data} />
      <Records data={data} />
      <StandardsBars data={data} today={today} year={view.pos.year} />
      <Heatmap data={data} today={today} />
      <HabitsBySeason data={data} today={today} />
      <SleepCharts data={data} today={today} />
      <Activity data={data} today={today} />
      <ReadinessVsTraining data={data} today={today} />
      <Trophies data={data} today={today} />
      <Runes />
    </div>
  );
}

function RoadProgress({ view }: { view: DayView }) {
  const p = view.pos;
  return (
    <Card tone="ember" toned>
      <div className="row between">
        <div>
          <div className="label">The long road</div>
          <div className="big" style={{ marginTop: 4 }}>Week {p.status === 'before' ? 0 : p.roadWeek}<span className="muted" style={{ fontSize: 18 }}> / {ROAD_WEEKS}</span></div>
        </div>
        <div className="chips" style={{ justifyContent: 'flex-end', maxWidth: '50%' }}>
          <Chip plain>Year {p.year}</Chip>
          <Chip tone={TPL_TONE[p.tpl]}>{p.block.code}</Chip>
          <Chip tone={p.season.c}>{p.season.review ? 'Review' : `S${p.season.n}`}</Chip>
        </div>
      </div>
      <div className="bar t-ember" style={{ marginTop: 12, height: 10 }}>
        <i style={{ width: `${((p.status === 'before' ? 0 : p.roadWeek) / ROAD_WEEKS) * 100}%` }} />
      </div>
      {p.pausedDays > 0 && <div className="tiny muted" style={{ marginTop: 6 }}>{p.pausedDays} days paused so far. The map slid with you.</div>}
    </Card>
  );
}

function Weight({ data, from, to, today }: { data: Data; from: ISODate; to: ISODate; today: ISODate }) {
  const avg = useMemo(() => weightAverageSeries(from, today, data), [data, from, today]);
  const target = useMemo(() => targetSeries(from, to, data), [data, from, to]);
  const bands = useMemo(() => phaseBands(from, to, data), [data, from, to]);
  const u = unitsOf(data.profile);
  return (
    <section className="section">
      <SectionTitle>Weight</SectionTitle>
      <Card>
        <LineChart series={[{ name: '7-day average', tone: 'ember', points: inUnit(avg, u) }, { name: 'Plan target', tone: 'ash', points: inUnit(target, u), dashed: true }]} bands={bands} unit={` ${u.label}`} from={from} to={to} format={(v) => fmtKg(round1(v))} />
        <div className="legend" style={{ marginTop: 4 }}>
          <span className="t-frost"><i />Cut</span>
          <span className="t-gold"><i />Hold or keep</span>
          <span className="t-moss"><i />Build</span>
          <span className="t-ash"><i />Reassess</span>
        </div>
        {avg.length === 0 && <div className="tiny muted">Weigh in 3 mornings a week to see the average.</div>}
      </Card>
    </section>
  );
}

function BodyFat({ data, from, to }: { data: Data; from: ISODate; to: ISODate }) {
  const points = bodyFatSeries(data);
  const targets = bodyFatTargets(data).filter((p) => p.x >= from && p.x <= to);
  const { lean, ffmi } = leanSeries(data);
  const u = unitsOf(data.profile);
  return (
    <section className="section">
      <SectionTitle>Body fat and lean mass</SectionTitle>
      <Card>
        <LineChart series={[{ name: 'Logged', tone: 'gold', points, dots: true }, { name: 'Target at block end', tone: 'ash', points: targets, dashed: true, dots: true }]} unit="%" from={from} to={to} />
      </Card>
      {lean.length > 0 && (
        <div className="grid2">
          <Card>
            <div className="label">Lean mass</div>
            <LineChart series={[{ name: `Lean ${u.label}`, tone: 'moss', points: inUnit(lean, u), dots: true }]} unit={` ${u.label}`} height={120} />
          </Card>
          <Card>
            <div className="label">FFMI</div>
            {ffmi.length ? <LineChart series={[{ name: 'FFMI', tone: 'frost', points: ffmi, dots: true }]} refY={{ y: 22, label: 'goal 22', tone: 'gold' }} height={120} /> : <Empty>Add your height in Settings.</Empty>}
          </Card>
        </div>
      )}
    </section>
  );
}

function Strength({ data }: { data: Data }) {
  const [lift, setLift] = useState<LiftKey>('bench');
  const { tests, sessions } = e1rmSeries(lift, data);
  const u = unitsOf(data.profile);
  return (
    <section className="section">
      <SectionTitle>Estimated 1RM</SectionTitle>
      <Card>
        <div className="chips" style={{ marginBottom: 8 }}>
          {STAT_LIFTS.map((l) => (
            <button key={l} className={cx('chip', lift === l ? 't-ember solid' : 'plain')} onClick={() => setLift(l)}>{LIFTS[l].short}</button>
          ))}
        </div>
        <LineChart series={[{ name: 'From sessions', tone: 'ember', points: inUnit(sessions, u) }, { name: 'Tests', tone: 'gold', points: inUnit(tests, u), scatter: true }]} unit={` ${u.label}`} format={(v) => fmtKg(round1(v))} />
        <div className="tiny muted">Hollow dots are unverified benchmarks.</div>
      </Card>
    </section>
  );
}

function WorkingWeight({ data }: { data: Data }) {
  const names = exerciseNames(data);
  const [name, setName] = useState<string>(names[0] ?? '');
  const pts = name ? workingWeightSeries(name, data) : [];
  const u = unitsOf(data.profile);
  return (
    <section className="section">
      <SectionTitle>Working weight</SectionTitle>
      <Card>
        {names.length === 0 ? (
          <Empty>Tick exercises in Train to build this.</Empty>
        ) : (
          <>
            <select className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Exercise" style={{ marginBottom: 8 }}>
              {names.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <LineChart series={[{ name, tone: 'moss', points: inUnit(pts, u), dots: true }]} bands={pts.length ? phaseBands(pts[0].x, pts[pts.length - 1].x, data) : []} unit={` ${u.label}`} format={(v) => fmtKg(round1(v))} />
            <div className="tiny muted">Gold dots: hard. Hollow: assumed from the suggestion.</div>
          </>
        )}
      </Card>
    </section>
  );
}

function Records({ data }: { data: Data }) {
  const prs = personalRecords(data).slice(0, 12);
  const u = unitsOf(data.profile);
  return (
    <section className="section">
      <SectionTitle>Personal records</SectionTitle>
      <Card>
        {prs.length === 0 && <Empty>Your first record is waiting.</Empty>}
        {prs.map((p, i) => (
          <div key={i} className="list-row">
            <Trophy size={18} color="var(--gold)" />
            <div className="grow">
              <div style={{ fontWeight: 600 }}>{LIFTS[p.lift].short} · {u.w(p.e1rm, 1)}</div>
              <div className="tiny muted">{formatMedium(p.date)} · {p.source === 'test' ? 'tested' : 'from a session'}{p.prev ? ` · was ${u.w(p.prev, 1)}` : ''}</div>
            </div>
          </div>
        ))}
      </Card>
    </section>
  );
}

function StandardsBars({ data, today, year }: { data: Data; today: ISODate; year: number }) {
  const v = standardValues(today, data);
  const values: Record<string, number | null> = { ohp: v.ohp, pullup3: v.pullup3, farmer: v.farmer, neck: v.neck, waistHeight: v.waistHeight, zone2: v.zone2 };
  const u = unitsOf(data.profile);
  return (
    <section className="section">
      <SectionTitle>Standards</SectionTitle>
      <Card>
        {STANDARDS.map((s) => {
          const cur = values[s.key];
          const target = s.targets ? (year <= 1 ? s.targets.y1 : year === 2 ? s.targets.y2 : s.targets.goal) : null;
          const pct = cur != null && target ? (s.lowerIsBetter ? Math.min(1, target / cur) : Math.min(1, cur / target)) : 0;
          const extra = s.key === 'bench' && v.benchGain != null ? `+${(v.benchGain * 100).toFixed(1)}%` : null;
          return (
            <div key={s.key} style={{ padding: '8px 0', borderBottom: '1px solid rgba(47,53,60,.6)' }}>
              <div className="bar-row">
                <span className="small" style={{ fontWeight: 600 }}>{s.name}</span>
                <span className="small num">{cur != null ? (s.key === 'waistHeight' ? cur.toFixed(2) : /kg/.test(s.unit) ? u.w(cur, 1) : fmtKg(round1(cur))) : extra ?? '·'}</span>
              </div>
              {target != null && (
                <div className={cx('bar', pct >= 1 ? 't-moss' : 't-gold')} style={{ marginTop: 4 }}>
                  <i style={{ width: `${pct * 100}%` }} />
                </div>
              )}
              <div className="tiny muted" style={{ marginTop: 2 }}>Y1 {standardText(s, 'y1', u)} · Y2 {standardText(s, 'y2', u)} · Goal {standardText(s, 'goal', u)}</div>
            </div>
          );
        })}
      </Card>
    </section>
  );
}

function Heatmap({ data, today }: { data: Data; today: ISODate }) {
  const start = addDays(startOfWeek(today), -77);
  const days = Array.from({ length: 84 }, (_, i) => addDays(start, i));
  return (
    <section className="section">
      <SectionTitle>Check-ins, 12 weeks</SectionTitle>
      <Card>
        <div className="heat" role="img" aria-label="Check-in heatmap">
          {days.map((d) => {
            const t = data.days.get(d)?.readiness?.type;
            const tone = t ? sessionTone(t) : null;
            return <div key={d} className={cx('c', tone && `t-${tone}`)} style={tone ? { background: 'var(--tone)', borderColor: 'var(--tone)', opacity: d > today ? 0.2 : 0.9 } : { opacity: d > today ? 0.3 : 1 }} title={`${d}${t ? `: ${t}` : ''}`} />;
          })}
        </div>
        <div className="row between tiny muted" style={{ marginTop: 6 }}>
          <span>{formatShort(start)}</span>
          <span>Rows: Mon to Sun</span>
          <span>{formatShort(addDays(start, 83))}</span>
        </div>
      </Card>
    </section>
  );
}

function HabitsBySeason({ data, today }: { data: Data; today: ISODate }) {
  const pauses = pausesOf(data.plan);
  const rows = SEASONS.map((s, i) => ({ s, i, start: realDateOf(s.start, pauses), end: realDateOf(s.end, pauses) })).filter((x) => x.s.n > 0 && x.start <= today);
  return (
    <section className="section">
      <SectionTitle>Habit completion by season</SectionTitle>
      <Card>
        {rows.length === 0 && <Empty>Starts with season 1.</Empty>}
        {rows.map(({ s, i, start, end }) => {
          const r = habitRate(s.n, start, end < today ? end : today, data);
          return (
            <div key={i} className={`t-${s.c}`} style={{ padding: '6px 0' }}>
              <div className="bar-row">
                <span className="small">S{s.n} {s.name}</span>
                <span className="small num">{r.rate != null ? `${Math.round(r.rate * 100)}%` : '·'}</span>
              </div>
              <div className="bar" style={{ marginTop: 4 }}><i style={{ width: `${(r.rate ?? 0) * 100}%` }} /></div>
            </div>
          );
        })}
      </Card>
    </section>
  );
}

function SleepCharts({ data, today }: { data: Data; today: ISODate }) {
  const days = Array.from({ length: 56 }, (_, i) => addDays(today, -55 + i));
  const dur = days.map((d) => ({ x: d, c: data.days.get(d)?.checkin })).filter((x) => x.c).map((x) => ({ x: x.x, y: round1((x.c?.sleepMin ?? 0) / 60) }));
  const score = days.map((d) => ({ x: d, c: data.days.get(d)?.checkin })).filter((x) => x.c).map((x) => ({ x: x.x, y: x.c?.sleepScore ?? 0 }));
  const avg = (pts: { x: ISODate; y: number }[]) => pts.map((p) => {
    const w = pts.filter((q) => q.x <= p.x && q.x > addDays(p.x, -7));
    return { x: p.x, y: round1(w.reduce((s, q) => s + q.y, 0) / w.length) };
  });
  return (
    <section className="section">
      <SectionTitle>Sleep</SectionTitle>
      <Card>
        <div className="label">Duration</div>
        <LineChart series={[{ name: 'Night', tone: 'frost', points: dur, scatter: true }, { name: '7-day average', tone: 'frost', points: avg(dur) }]} refY={{ y: 7.5, label: '7.5 h' }} unit=" h" format={(v) => (v >= 1 ? formatSleep(v * 60) : String(v))} />
      </Card>
      <Card>
        <div className="label">Sleep score</div>
        <LineChart series={[{ name: 'Night', tone: 'gold', points: score, scatter: true }, { name: '7-day average', tone: 'gold', points: avg(score) }]} height={140} />
      </Card>
    </section>
  );
}

function Activity({ data, today }: { data: Data; today: ISODate }) {
  const days = Array.from({ length: 28 }, (_, i) => addDays(today, -27 + i));
  const steps = days.map((d) => ({ label: formatShort(d), y: data.days.get(d)?.steps ?? 0, tone: (data.days.get(d)?.steps ?? 0) >= STEPS_GOAL ? ('moss' as const) : ('ash' as const) }));
  const weeks = Array.from({ length: 12 }, (_, i) => addDays(startOfWeek(today), -7 * (11 - i)));
  const cardio = weeks.map((w) => ({ label: formatShort(w), y: live(data.cardio).filter((c) => c.date >= w && c.date <= addDays(w, 6)).reduce((s, c) => s + c.minutes, 0), tone: 'frost' as const }));
  const mobility = weeks.map((w) => ({ label: formatShort(w), y: Array.from({ length: 7 }, (_, i) => data.days.get(addDays(w, i))?.mobilityMin ?? 0).reduce((a, b) => a + b, 0), tone: 'moss' as const }));
  return (
    <section className="section">
      <SectionTitle>Activity</SectionTitle>
      <Card>
        <div className="label">Daily steps</div>
        <BarChart bars={steps} refY={{ y: STEPS_GOAL, label: '10,000' }} />
      </Card>
      <div className="grid2">
        <Card><div className="label">Cardio min / week</div><BarChart bars={cardio} height={120} unit=" min" /></Card>
        <Card><div className="label">Mobility min / week</div><BarChart bars={mobility} height={120} unit=" min" /></Card>
      </div>
    </section>
  );
}

function ReadinessVsTraining({ data, today }: { data: Data; today: ISODate }) {
  const days = Array.from({ length: 28 }, (_, i) => addDays(today, -27 + i));
  const bars = days.map((d) => {
    const r = data.days.get(d)?.readiness;
    return { label: `${formatShort(d)}${r ? ` · ${r.type}` : ''}`, y: r?.score ?? 0, tone: r ? sessionTone(r.type) : ('ash' as const) };
  });
  return (
    <section className="section">
      <SectionTitle>Readiness and the session served</SectionTitle>
      <Card>
        <BarChart bars={bars} refY={{ y: 75, label: 'Full line 75' }} />
        <div className="legend">
          <span className="t-moss"><i />Full or Moderate</span>
          <span className="t-gold"><i />Light or sparing</span>
          <span className="t-ember"><i />Recovery</span>
        </div>
      </Card>
    </section>
  );
}

function Trophies({ data, today }: { data: Data; today: ISODate }) {
  const list = useMemo(() => trophies(today, data), [data, today]);
  const earned = list.filter((t) => t.on);
  const locked = list.filter((t) => !t.on);
  return (
    <section className="section">
      <SectionTitle right={<span className="small muted">{earned.length} earned</span>}>Trophies</SectionTitle>
      <div className="grid2">
        {[...earned, ...locked.slice(0, Math.max(0, 8 - earned.length))].map((t) => (
          <Card key={t.id} tone={t.tone} tint={!!t.on} style={t.on ? undefined : { opacity: 0.55 }}>
            <div className="row">
              {t.on ? <Trophy size={20} color="var(--tone)" /> : <Lock size={18} className="muted" />}
              <div className="grow">
                <div style={{ fontFamily: 'var(--head)', fontSize: 14, color: t.on ? 'var(--tone)' : undefined }}>{t.name}</div>
                <div className="tiny muted">{t.what}{t.on ? ` · ${formatShort(t.on)}` : ''}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
