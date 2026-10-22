// Mind and body support during a layoff: what is being kept (measurements, weight, photos on the phone),
// and a mindset check that warns against coming back too early.
import { diffDays, formatMedium } from '../engine/dates';
import { weeklyAverage } from '../engine/formulas';
import type { Insight } from '../engine/insights';
import type { Data } from '../engine/model';
import { unitsOf } from '../engine/units';
import type { ISODate } from '../plan/types';
import { constraintsOn } from './constraints';
import { proteinTarget, proteinWeek } from './fuel';
import type { RecordOf } from './model';
import { provideInsights } from './registry';

export const mindsetOn = (date: ISODate, data: Data): RecordOf<'mindset'> | null =>
  (data.recovery?.records ?? []).filter((r): r is RecordOf<'mindset'> => r.kind === 'mindset' && r.date <= date && diffDays(date, r.date) <= 3).sort((a, b) => (a.date < b.date ? -1 : 1)).at(-1) ?? null;

export const mindsetId = (date: ISODate) => `ms:${date}`;

const MEASURES: { key: 'neckCm' | 'shouldersCm' | 'chestCm' | 'armCm'; label: string }[] = [
  { key: 'neckCm', label: 'Neck' },
  { key: 'shouldersCm', label: 'Shoulders' },
  { key: 'chestCm', label: 'Chest' },
  { key: 'armCm', label: 'Arm' },
];

/** What a layoff is keeping: girths against before the injury, the weight trend, protein. Facts, no spin. */
export function reassurance(date: ISODate, data: Data): string[] {
  const ctx = constraintsOn(date, data);
  const start = ctx?.areas.map((a) => a.injury.start).sort()[0];
  const out: string[] = [];
  const rows = (data.recovery?.records ?? []).filter((r): r is RecordOf<'measure'> => r.kind === 'measure' && r.date <= date).sort((a, b) => (a.date < b.date ? -1 : 1));
  const last = rows.at(-1);
  const before = start ? rows.filter((r) => r.date < start).at(-1) : rows.at(-2);
  if (last && before && last !== before) {
    const parts = MEASURES.filter((m) => last[m.key] != null && before[m.key] != null).map((m) => {
      const d = Math.round(((last[m.key] as number) - (before[m.key] as number)) * 10) / 10;
      return `${m.label} ${last[m.key]} cm (${d === 0 ? 'same' : `${d > 0 ? '+' : ''}${d}`})`;
    });
    if (parts.length) out.push(`Since ${formatMedium(before.date)}: ${parts.join(', ')}.`);
  }
  if (start) {
    const now = weeklyAverage(data.body, date);
    const then = weeklyAverage(data.body, start);
    const u = unitsOf(data.profile);
    if (now != null && then != null) out.push(`Weight ${u.w(now, 1)}, ${Math.abs(now - then) < 0.3 ? 'holding' : `${now > then ? '+' : '-'}${u.w(Math.abs(now - then), 1)}`} since the injury.`);
    const p = proteinWeek(date, data);
    if (p.logged) out.push(`Protein on target ${p.hit} of ${p.logged} logged days (target ${proteinTarget(date, data).grams} g).`);
  }
  return out;
}

// Frustration during an injury: the moment people come back too early.
provideInsights((date, data): Insight[] => {
  const m = mindsetOn(date, data);
  const ctx = constraintsOn(date, data);
  if (!m || !ctx?.areas.length) return [];
  const out: Insight[] = [];
  if (m.frustration >= 4) {
    out.push({
      id: `rec:mind:${m.date}`, priority: 74, tone: 'gold', icon: 'alert', area: 'session', dismissible: true,
      title: 'Frustrated? Coming back early is the biggest risk now',
      body: 'Your yoke, upper back and arms keep training. The injured area comes back faster when it is not rushed.',
      why: ['A re-injury in the first weeks usually costs far more time than the wait.', 'The 2029 goal is built over years; a few protected weeks protect it.', `You rated frustration ${m.frustration}/5.`],
      action: { kind: 'open', href: '#/recover/goal', label: 'What is kept' },
    });
  }
  if (m.confidence <= 2 && ctx.areas.some((a) => a.level === 'return' || a.level === 'build')) {
    out.push({
      id: `rec:conf:${m.date}`, priority: 58, tone: 'frost', icon: 'habit', area: 'session', dismissible: true,
      title: 'Low confidence in the area: that is normal',
      body: 'The ramp goes one step at a time. Repeat a step as often as you need; it is never a failure.',
      why: [`You rated confidence ${m.confidence}/5.`],
    });
  }
  return out;
});
