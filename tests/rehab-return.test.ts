// Phase 7: physio prescriptions, the conservative retest and the clinician report. Synthetic values only.
import { describe, expect, it } from 'vitest';
import { addDays } from '../src/engine/dates';
import type { Data } from '../src/engine/model';
import { computeDay } from '../src/engine/today';
import type { RecoveryRecord } from '../src/recovery/model';
import { injuryReport } from '../src/recovery/report';
import { RETEST, retestE1rm, retestOffers } from '../src/recovery/retest';
import { tagsFor } from '../src/recovery/tags';
import { morning } from './fixtures';
import { event, injCheckin, injury, moduleData } from './recovery-helpers';

const MON = '2027-05-10';
const THU = addDays(MON, 3);
const SUN = addDays(MON, 6);
const day = (data: Data, d: string) => computeDay(d, data, morning(d));

function withRx(items: Extract<RecoveryRecord, { kind: 'rx' }>['items'], extra: Partial<Extract<RecoveryRecord, { kind: 'rx' }>> = {}, phase: 'protect' | 'load' = 'load') {
  const inj = injury({ region: 'calf', side: 'right', start: '2027-05-03' });
  const rx: RecoveryRecord = { id: `rx:${inj.id}`, kind: 'rx', injuryId: inj.id, date: '2027-05-05', items, updatedAt: 1, ...extra };
  return { inj, data: moduleData({ injuries: [inj], records: [event(inj, '2027-05-03', { event: 'phase', phase }), rx] }) };
}

describe('physio prescription', () => {
  it('replaces the generic rehab, on the days it is scheduled', () => {
    const { data } = withRx([{ name: 'Slow calf raise off a step', sets: 3, reps: '15', days: [3] }]);
    const thu = day(data, THU).session.exercises;
    expect(thu.some((e) => e.key.startsWith('RX:') && e.name === 'Slow calf raise off a step' && e.load === null)).toBe(true);
    expect(thu.some((e) => e.key.startsWith('REHAB:'))).toBe(false);
    expect(day(data, MON).session.exercises.some((e) => e.key.startsWith('RX:'))).toBe(false);
  });

  it('applies in Protect too (the physio decides), but never under a red flag', () => {
    const { data } = withRx([{ name: 'Ankle pumps', sets: 2, reps: '20' }], {}, 'protect');
    expect(day(data, MON).session.exercises.some((e) => e.name === 'Ankle pumps')).toBe(true);
    const flagged = withRx([{ name: 'Ankle pumps', sets: 2, reps: '20' }]);
    flagged.data.recovery!.checkins.push(injCheckin(flagged.inj, MON, { flags: ['numbness-spreading'] }));
    expect(day(flagged.data, MON).session.exercises.some((e) => e.name === 'Ankle pumps')).toBe(false);
  });

  it('its blocked movements always win', () => {
    const { data } = withRx([], { blocked: ['overhead'] });
    for (let i = 0; i < 6; i++) for (const e of day(data, addDays(MON, i)).session.exercises) if (tagsFor(e.name)) expect([e.name, tagsFor(e.name)!.moves.includes('overhead')]).toEqual([e.name, false]);
  });

  it('a rest day gets its own physio task', () => {
    const { data, inj } = withRx([{ name: 'Ankle pumps', sets: 2, reps: '20' }]);
    const task = day(data, SUN).tasks.training.find((t) => t.id === `rec:rx:${inj.id}`);
    expect(task?.sub).toBe('Ankle pumps');
  });
});

describe('return-to-training retest', () => {
  it('is offered for unverified benchmarks, never for a lift that touches a recovering area, and never to failure', () => {
    const inj = injury({ region: 'quad', side: 'left', start: '2027-05-03' });
    const data = moduleData({ injuries: [inj], records: [event(inj, '2027-05-03', { event: 'phase', phase: 'build' })] });
    const offers = retestOffers(MON, data);
    expect(offers.some((o) => o.lift === 'squat' || o.lift === 'hipthrust')).toBe(false);
    const bench = offers.find((o) => o.lift === 'bench');
    expect(bench?.reason).toMatch(/benchmark/);
    expect(bench?.rir).toBe(RETEST.rirOther);
    for (const o of offers) expect(o.rir).toBeGreaterThanOrEqual(2);
    const free = retestOffers(MON, moduleData());
    expect(free.find((o) => o.lift === 'squat')?.rir).toBe(RETEST.rirSpine);
    expect(free.find((o) => o.lift === 'squat')?.targetKg).toBeLessThanOrEqual(150 * 0.75);
  });

  it('logs the conservative e1RM (reps done), and shows the upper estimate', () => {
    const e = retestE1rm(100, 8, 2);
    expect(e.logged).toBeLessThan(e.upper);
    expect(e.logged).toBeCloseTo(126.7, 1);
  });
});

describe('clinician report', () => {
  it('is a valid PDF with the timeline, check-ins and restrictions, in plain ASCII', () => {
    const inj = injury({ region: 'calf', side: 'right', start: '2027-04-01', location: 'upper, inner', mechanism: { exercise: 'Incline Bench Press 30°', felt: 'gradual' }, restrictions: { text: 'No running', blocked: ['impact'] } });
    const data = moduleData({ injuries: [inj], records: [event(inj, '2027-04-01', { event: 'phase', phase: 'protect' }), event(inj, '2027-04-08', { event: 'phase', phase: 'load' })], checkins: [...Array(45).keys()].map((i) => injCheckin(inj, addDays('2027-04-02', i), { painRest: i % 5, painWalk: (i + 2) % 6 })) });
    const bytes = injuryReport(inj, MON, data);
    const text = new TextDecoder().decode(bytes);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(bytes.every((b) => b < 128)).toBe(true);
    expect(text).toContain('Injury report: Right calf');
    expect(text).toContain('Load phase');
    expect(text).toContain('Impact or jumping');
    expect(text).toContain('30 deg');
    // Every xref offset points at its object.
    const xref = text.slice(text.lastIndexOf('xref'));
    const offsets = [...xref.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    offsets.forEach((o, i) => expect(text.slice(o, o + 12)).toMatch(new RegExp(`^${i + 1} 0 obj`)));
    expect(Number(text.match(/\/Count (\d+)/)?.[1])).toBeGreaterThanOrEqual(2);
  });
});
