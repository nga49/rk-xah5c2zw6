import { LIFTS, STAT_LIFTS, TPL_LABEL, PHASE_LABEL } from '../plan';
import { ASK_INSTRUCTION } from '../plan/content';
import { addDays, formatLong, formatSleep, startOfWeek } from './dates';
import { fmtInt, fmtKg, mean, round1, weeklyAverage } from './formulas';
import { habitRate } from './insights';
import { e1rmFor } from './loads';
import type { Data } from './model';
import { live } from './model';
import type { DayView } from './today';

const doseOf = (e: { sets: number; reps: number | string | null; work_s?: number; perSide?: boolean }) =>
  e.reps != null ? `${e.sets} × ${e.reps}${e.perSide ? ' per side' : ''}` : e.work_s ? `${e.sets} × ${e.work_s} s` : `${e.sets} sets`;

/** Compact plain-text context for Claude (3.6). The profile paragraph comes from the phone, never from code. */
export function contextPack(view: DayView, data: Data, question: string): string {
  const { pos, decision, session } = view;
  const L: string[] = [ASK_INSTRUCTION, ''];
  const b = pos.block;
  L.push(`Date: ${formatLong(view.date)} ${view.date.slice(0, 4)} (local)`);
  L.push(`Plan: Year ${pos.year}, block ${b.code} ${b.name} (${TPL_LABEL[pos.tpl]}, ${PHASE_LABEL[b.phase]}), week ${pos.week} of ${b.weeks}, ${pos.weekType.name}, RIR ${pos.weekType.rir}${pos.status === 'paused' ? ', plan paused' : ''}`);
  L.push(`Today: ${session.title}${session.code ? ` (${session.kind})` : ''}. Session type: ${decision.type}. Why: ${decision.reason}.`);
  const c = view.checkin;
  if (c) {
    const parts = [`sleep ${formatSleep(c.sleepMin)}`, `sleep score ${c.sleepScore}`];
    if (c.bodyBattery != null) parts.push(`Body Battery ${c.bodyBattery}`);
    if (c.hrvStatus) parts.push(`HRV ${c.hrvStatus}`);
    if (c.restingHr != null) parts.push(`resting HR ${c.restingHr}`);
    parts.push(`energy ${c.energy}/5`, `stress ${c.stress}/5`, `back pain ${c.backPain}/10`, `knee pain ${c.kneePain}/10`);
    if (c.radiating) parts.push('pain down the leg, numbness or weakness');
    L.push(`Readiness ${decision.readiness?.score ?? '?'}: ${parts.join(', ')}.`);
  } else L.push('No check-in yet today.');
  if (session.exercises.length) {
    L.push('Session:');
    for (const e of session.exercises) {
      const load = e.load?.kg != null ? ` @ ${fmtKg(e.load.kg)} kg${e.load.added ? ' added' : ''}` : '';
      L.push(`- ${e.name} ${doseOf(e)}${load}, RIR ${e.rir}${e.changes.length ? ` (${e.changes.join('; ')})` : ''}`);
    }
  } else if (session.notes.length) L.push(`Plan today: ${session.notes.join(', ')}.`);
  if (session.cardio.length) L.push(`Cardio: ${session.cardio.map((r) => r.label).join(', ')}.`);

  const hist: string[] = [];
  for (let i = 14; i >= 1; i--) {
    const d = addDays(view.date, -i);
    const r = data.days.get(d)?.readiness;
    if (r) hist.push(`${d.slice(5)} ${r.score} ${r.type}${data.days.get(d)?.sessionDone ? '' : ' (not done)'}`);
  }
  L.push(`Last 14 days, readiness and session type: ${hist.length ? hist.join('; ') : 'no data'}.`);
  const sleeps = Array.from({ length: 7 }, (_, i) => data.days.get(addDays(view.date, -i))?.checkin?.sleepMin).filter((x): x is number => x != null);
  L.push(`Sleep 7-day average: ${sleeps.length ? formatSleep(mean(sleeps) as number) : 'no data'}.`);
  const wNow = weeklyAverage(data.body, view.date);
  const w4 = weeklyAverage(data.body, addDays(view.date, -28));
  L.push(`Weight 7-day average: ${wNow != null ? `${round1(wNow)} kg` : 'not enough weigh-ins'}${wNow != null && w4 != null ? `, 4-week trend ${round1((wNow - w4) / 4)} kg/week` : ''}.`);
  const maxes = STAT_LIFTS.map((l) => {
    const info = e1rmFor(l, view.date, data);
    return info ? `${LIFTS[l].short} ${fmtKg(Math.round(info.e1rm * 10) / 10)} kg (${info.source === 'test' ? `tested ${info.baseDate}` : info.source === 'benchmark' ? 'benchmark, unverified' : 'estimated'})` : null;
  }).filter(Boolean);
  L.push(`Latest e1RMs: ${maxes.length ? maxes.join('; ') : 'none yet'}.`);
  const ws = startOfWeek(view.date);
  const steps = Array.from({ length: 7 }, (_, i) => addDays(ws, i)).filter((d) => d <= view.date).map((d) => data.days.get(d)?.steps).filter((x): x is number => x != null);
  const cardio = live(data.cardio).filter((x) => x.date >= ws && x.date <= view.date).reduce((n, x) => n + x.minutes, 0);
  L.push(`This week: steps average ${steps.length ? fmtInt(mean(steps) as number) : 'no data'}, cardio ${cardio} min.`);
  const s = pos.season;
  if (s.n > 0) {
    const r = habitRate(s.n, pos.seasonStart, view.date, data);
    L.push(`Season ${s.n} ${s.name} (${s.pillar}), day ${pos.seasonDay} of ${pos.seasonLength}. Habit: ${s.habit}. Done ${r.done} of ${r.due} days${r.rate != null ? ` (${Math.round(r.rate * 100)}%)` : ''}.`);
  } else L.push(`Review season, day ${pos.seasonDay} of ${pos.seasonLength}.`);
  if (view.insights.length) L.push(`Active insights: ${view.insights.slice(0, 5).map((i) => i.title).join('; ')}.`);
  const p = data.profile;
  if (p) {
    const bits = [p.goal && `Goal: ${p.goal}.`, p.injuries && `Injuries and health: ${p.injuries}.`, p.rules && `Training rules: ${p.rules}.`].filter(Boolean);
    if (bits.length) L.push(`Profile: ${bits.join(' ')}`);
  }
  L.push('', `Question: ${question.trim() || 'What should I focus on today?'}`);
  return L.join('\n');
}
