// Milestone 3: check-in, readiness, session types and the intelligence layer.
// Acceptance tests 7-11, 12a, 13 and the 5.3b unit tests (items 2, 3, 4, 7).
import { describe, expect, it } from 'vitest';
import { addDays } from '../src/engine/dates';
import { roundDown } from '../src/engine/formulas';
import { buildInsights } from '../src/engine/insights';
import { accessoryProgress, dropFive, e1rmFor, feedbackAdjustments } from '../src/engine/loads';
import type { Data, SessionType } from '../src/engine/model';
import { getPosition } from '../src/engine/position';
import { calibrationFor, decide, readinessScore } from '../src/engine/readiness';
import { missedDayOffer } from '../src/engine/schedule';
import { buildSession, modsForType } from '../src/engine/session';
import { computeDay } from '../src/engine/today';
import { checkin, GOOD, makeData, setDay, test3rm, weight } from './helpers';

const day = (date: string, data: Data) => computeDay(date, data, new Date(`${date}T08:00:00`));

describe('acceptance 7-11: readiness and session type', () => {
  it('7. sleep 7 h 50, score 84, energy 4, stress 2, no pain: score 75+, Full', () => {
    const data = makeData();
    checkin(data, '2026-10-20', { sleepMin: 470, sleepScore: 84, energy: 4, stress: 2 });
    const v = day('2026-10-20', data);
    expect(v.decision.readiness?.score).toBeGreaterThanOrEqual(75);
    expect(v.decision.type).toBe('Full');
  });

  it('8. sleep 5 h 40, score 58, energy 3: 100 - 25 - 10 - 5 = 60, Light: bench 75%, finishers hidden, cardio capped at 20', () => {
    const data = makeData();
    const c = { sleepMin: 340, sleepScore: 58, energy: 3, stress: 2, backPain: 0, kneePain: 0 };
    expect(readinessScore(c, '2026-11-02', data).score).toBe(60);
    checkin(data, '2026-11-02', c); // M1 week 3, Monday
    const v = day('2026-11-02', data);
    expect(v.decision.type).toBe('Light');
    const bench = v.session.exercises.find((e) => e.lift === 'bench');
    const full = buildSession({ date: '2026-11-02', code: 'BLADES', pos: v.pos, mods: modsForType('Full'), data }).exercises.find((e) => e.lift === 'bench');
    expect(bench?.load?.kg).toBe(roundDown((full?.load?.kg as number) * 0.75));
    expect(v.session.exercises.some((e) => e.role === 'finisher')).toBe(false);
    expect(v.session.skipped.map((s) => s.name)).toContain('Push-up');
    // Wednesday cardio is capped at 20 min on a Light day.
    checkin(data, '2026-11-04', c);
    const wed = day('2026-11-04', data);
    expect(wed.decision.type).toBe('Light');
    expect(wed.session.cardio.every((r) => r.minutes <= 20)).toBe(true);
    expect(wed.tasks.training.map((t) => t.label)).toContain('Easy, 20 min or a walk');
  });

  it('9. back pain 6: Recovery regardless of sleep, walk + back reset + breathing; two days in a row: doctor card', () => {
    const data = makeData();
    checkin(data, '2026-11-02', { ...GOOD, backPain: 6 });
    const v = day('2026-11-02', data);
    expect(v.decision.type).toBe('Recovery');
    expect(v.session.exercises).toHaveLength(0);
    expect(v.session.notes).toEqual(['30 to 45 min walk', '20 min back reset', '5 min breathing']);
    expect(v.session.mobility).toEqual({ routine: 'backReset', minutes: 20 });
    expect(v.decision.allowed).toEqual(['Recovery']);
    expect(v.insights.some((i) => i.title.startsWith('Check in with your doctor'))).toBe(false);
    checkin(data, '2026-11-03', { ...GOOD, backPain: 6 });
    const v2 = day('2026-11-03', data);
    expect(v2.decision.doctor).toBe(true);
    expect(v2.insights[0].title).toBe('Check in with your doctor or osteopath before training');
  });

  it('9b. pain down the leg, numbness or weakness: Recovery and the doctor card', () => {
    const data = makeData();
    checkin(data, '2026-11-02', { ...GOOD, backPain: 2, radiating: true });
    const v = day('2026-11-02', data);
    expect(v.decision.type).toBe('Recovery');
    expect(v.decision.doctor).toBe(true);
  });

  it('10. back pain 3 on a Thursday Strength day, good sleep: Spine-sparing, squat becomes leg press or sled push', () => {
    const data = makeData();
    checkin(data, '2026-10-22', { ...GOOD, backPain: 3 });
    const v = day('2026-10-22', data);
    expect(v.pos.tpl).toBe('S');
    expect(v.decision.type).toBe('Spine-sparing');
    const first = v.session.exercises[0];
    expect(first.originalName).toBe('Barbell Back Squat');
    expect(first.name).toBe('Leg Press');
    expect(`${first.sets} × ${first.reps}`).toBe('4 × 10');
    expect(first.note).toBe('Or Sled Push 4 × 20 m');
    expect(v.session.exercises.some((e) => e.lift === 'squat')).toBe(false);
    expect(v.decision.canUseFull).toBe(false);
  });

  it('11. knee pain 5 on a Thursday: Upper only', () => {
    const data = makeData();
    checkin(data, '2026-10-22', { ...GOOD, kneePain: 5 });
    const v = day('2026-10-22', data);
    expect(v.decision.type).toBe('Upper only');
    expect(v.session.exercises.every((e) => /leg curl/i.test(e.name))).toBe(true);
    expect(v.session.exercises[0].conditional).toBe('Only if pain-free');
    // On an upper day knee pain 5 trains as the score allows.
    checkin(data, '2026-10-23', { ...GOOD, kneePain: 5 });
    expect(day('2026-10-23', data).decision.type).toBe('Full');
  });

  it('knee pain 3-4: Knee-sparing swaps at the same sets', () => {
    const data = makeData();
    checkin(data, '2026-10-22', { ...GOOD, kneePain: 4 });
    const v = day('2026-10-22', data);
    expect(v.decision.type).toBe('Knee-sparing');
    const names = v.session.exercises.map((e) => e.name);
    expect(names).not.toContain('Barbell Back Squat');
    expect(names).not.toContain('Dumbbell Bulgarian Split Squat');
    expect(names).toContain('Walk');
    expect(v.session.exercises[0]).toMatchObject({ name: 'Barbell Hip Thrust with Bench', sets: 4 });
  });

  it('override: allowed, but never above what a pain rule allows', () => {
    const data = makeData();
    checkin(data, '2026-11-02', { sleepMin: 340, sleepScore: 58, energy: 3 });
    setDay(data, '2026-11-02', { override: 'Full' });
    const v = day('2026-11-02', data);
    expect(v.decision.type).toBe('Full');
    expect(v.decision.overridden).toBe(true);
    const sore = makeData();
    checkin(sore, '2026-10-22', { ...GOOD, backPain: 4 });
    setDay(sore, '2026-10-22', { override: 'Full' });
    const s = day('2026-10-22', sore);
    expect(s.decision.mods.spine).toBe(true);
    expect(s.session.exercises[0].name).toBe('Leg Press');
  });

  it('3RM tests only on a Full day; otherwise they move to the next Full day that week', () => {
    const data = makeData();
    checkin(data, '2027-01-04', { sleepMin: 340, sleepScore: 58, energy: 3 }); // Monday, Light
    const mon = day('2027-01-04', data);
    expect(mon.session.exercises.some((e) => e.role === 'test')).toBe(false);
    expect(mon.tasks.training.find((t) => t.id === 'test:ohp')?.sub).toBe('Moves to the next Full day');
    setDay(data, '2027-01-04', { sessionDone: true, sessionCode: 'BLADES' });
    checkin(data, '2027-01-05', GOOD);
    const tue = day('2027-01-05', data);
    expect(tue.session.exercises.filter((e) => e.role === 'test').map((e) => e.lift)).toEqual(['ohp', 'bench', 'pullup']);
  });
});

describe('acceptance 12a: accessory progression', () => {
  const name = 'Dumbbell Lateral Raise';
  it('12 kg clean twice at 15 reps: 14 kg with an up badge; one hard holds; two hard drop 5% to the nearest weight', () => {
    const data = makeData();
    weight(data, '2026-10-23', name, 12, 'clean');
    weight(data, '2026-10-30', name, 12, 'clean');
    const up = accessoryProgress(name, data.weights, '2026-11-06', 2);
    expect(up).toMatchObject({ kg: 14, badge: 'up', reason: '2 clean sessions in a row' });
    weight(data, '2026-11-06', name, 14, 'hard');
    expect(accessoryProgress(name, data.weights, '2026-11-13', 2)).toMatchObject({ kg: 14, badge: 'hold' });
    weight(data, '2026-11-13', name, 14, 'hard');
    expect(accessoryProgress(name, data.weights, '2026-11-20', 2)).toMatchObject({ kg: 12, badge: 'down' });
  });
  it('shows on the exercise in the session, pre-filled', () => {
    const data = makeData();
    weight(data, '2026-10-23', name, 12, 'clean');
    weight(data, '2026-10-30', name, 12, 'clean');
    const date = '2026-11-06'; // Friday
    const s = buildSession({ date, code: 'DRAUPNIR', pos: getPosition(date, data.plan), mods: modsForType('Full'), data });
    const ex = s.exercises.find((e) => e.name === name);
    expect(ex?.load).toMatchObject({ kg: 14, badge: 'up', badgeText: '↑ +2 kg' });
  });
  it('5% drop always goes at least one step down', () => {
    expect(dropFive(100, 'barbell', 2)).toBe(95);
    expect(dropFive(14, 'dumbbell', 2)).toBe(12);
    expect(dropFive(20, 'cable', 2)).toBe(17.5);
  });
});

describe('acceptance 13: missed heavy day', () => {
  it('Monday not done, Tuesday Full: BLADES today, LEVIATHAN later in the week', () => {
    const data = makeData();
    checkin(data, '2026-10-27', GOOD); // Tuesday
    const v = day('2026-10-27', data);
    expect(v.decision.type).toBe('Full');
    expect(v.offer?.missed).toBe('BLADES');
    expect(v.offer?.map['2026-10-27']).toBe('BLADES');
    expect(v.offer?.map['2026-10-28']).toBe('LEVIATHAN');
    expect(v.insights.some((i) => i.action?.kind === 'acceptSwap')).toBe(true);
    // Accepting it serves BLADES today.
    data.plan.push({ id: 's', kind: 'swap', date: '2026-10-27', weekStart: '2026-10-26', map: v.offer!.map, reason: 'missed', updatedAt: 1 });
    const after = day('2026-10-27', data);
    expect(after.session.title).toBe('BLADES');
    expect(after.offer).toBeNull();
    expect(day('2026-10-28', data).session.title).toBe('LEVIATHAN');
  });
  it('no offer on a Light day, and never two leg days in a row', () => {
    const data = makeData();
    expect(missedDayOffer('2026-10-27', data, 'Light', '2026-10-19')).toBeNull();
    // Thursday was a Recovery day: SPARTAN offered Friday, VALHALLA does not follow on Saturday.
    for (const d of ['2026-10-19', '2026-10-20', '2026-10-21']) setDay(data, d, { sessionDone: true, sessionCode: null });
    data.days.get('2026-10-19')!.sessionCode = 'BLADES';
    data.days.get('2026-10-20')!.sessionCode = 'LEVIATHAN';
    data.days.get('2026-10-21')!.sessionCode = 'GUARDIAN';
    const offer = missedDayOffer('2026-10-23', data, 'Full', '2026-10-19');
    expect(offer?.map['2026-10-23']).toBe('SPARTAN');
    expect(offer?.map['2026-10-24']).not.toBe('VALHALLA');
  });
});

describe('5.3b.2 session feedback loop', () => {
  const feel = (data: Data, date: string, f: 'easy' | 'right' | 'hard', rpe = 7) => setDay(data, date, { sessionDone: true, sessionCode: 'BLADES', feedback: { rpe, lifts: { bench: f } } });
  it('easy twice: +2.5%; hard twice: -2.5%; right resets', () => {
    const data = makeData();
    feel(data, '2026-10-19', 'easy');
    feel(data, '2026-10-26', 'easy');
    expect(e1rmFor('bench', '2026-10-27', data)?.e1rm).toBeCloseTo(160 * 1.025);
    feel(data, '2026-11-02', 'hard');
    feel(data, '2026-11-09', 'right');
    feel(data, '2026-11-16', 'hard');
    expect(feedbackAdjustments('bench', undefined, '2026-11-17', data)).toHaveLength(1);
    feel(data, '2026-11-23', 'hard');
    expect(e1rmFor('bench', '2026-11-24', data)?.e1rm).toBeCloseTo(160 * 1.025 * 0.975);
  });
  it('a new test re-bases the lift', () => {
    const data = makeData();
    feel(data, '2026-10-19', 'easy');
    feel(data, '2026-10-26', 'easy');
    data.maxes.push(test3rm('bench', 150, '2026-11-01'));
    expect(e1rmFor('bench', '2026-11-02', data)?.e1rm).toBeCloseTo(165);
  });
  it('RPE 9+ on a Full day: the next session of that type starts at Moderate loads', () => {
    const data = makeData();
    checkin(data, '2026-10-19', GOOD);
    setDay(data, '2026-10-19', { readiness: { score: 90, type: 'Full', reasons: [], overridden: false }, sessionDone: true, sessionCode: 'BLADES', feedback: { rpe: 9 } });
    checkin(data, '2026-10-26', GOOD);
    const v = day('2026-10-26', data);
    expect(v.decision.type).toBe('Moderate');
    expect(v.decision.reason).toContain('RPE 9');
  });
});

describe('5.3b.3 readiness calibration (bounded)', () => {
  function seed(weeks: number, mood: 'better' | 'worse'): Data {
    const data = makeData();
    const start = '2026-10-19';
    for (let i = 0; i < weeks * 7; i++) {
      const d = addDays(start, i);
      const better = mood === 'better';
      setDay(data, d, {
        checkin: GOOD,
        readiness: { score: better ? 60 : 90, type: (better ? 'Light' : 'Full') as SessionType, reasons: [], overridden: false },
        sessionDone: true,
        sessionCode: 'BLADES',
        feedback: { rpe: better ? 6 : 9.5, lifts: {} },
      });
    }
    return data;
  }
  it('inactive before 8 weeks', () => {
    const data = seed(7, 'better');
    expect(calibrationFor('2026-12-06', data)).toMatchObject({ offset: 0, active: false });
  });
  it('moves one point a week and never beyond -5', () => {
    const data = seed(30, 'better');
    const c10 = calibrationFor(addDays('2026-10-19', 7 * 10), data);
    expect(c10.active).toBe(true);
    expect(c10.offset).toBe(-2);
    const late = calibrationFor(addDays('2026-10-19', 7 * 30), data);
    expect(late.offset).toBe(-5);
    for (let i = 1; i < late.history.length; i++) expect(Math.abs(late.history[i].offset - late.history[i - 1].offset)).toBeLessThanOrEqual(1);
  });
  it('never beyond +5, and a reset starts again from 0', () => {
    const data = seed(30, 'worse');
    expect(calibrationFor(addDays('2026-10-19', 7 * 30), data).offset).toBe(5);
    data.profile = { ...data.profile!, calibrationResetAt: addDays('2026-10-19', 7 * 28) };
    expect(calibrationFor(addDays('2026-10-19', 7 * 30), data).offset).toBe(2);
  });
  it('shifts the band lines', () => {
    const data = makeData();
    const c = { sleepMin: 420, sleepScore: 75, energy: 4, stress: 2, backPain: 0, kneePain: 0 }; // 100 - 5 - 5 = 90 -> no
    const r = readinessScore({ ...c, energy: 3, stress: 4 }, '2026-11-02', data, 5); // 100 - 5 - 5 - 5 - 10 = 75
    expect(r.score).toBe(75);
    expect(r.band).toBe('Moderate'); // Full line moved to 80
    expect(readinessScore({ ...c, energy: 3, stress: 4 }, '2026-11-02', data, 0).band).toBe('Full');
  });
});

describe('5.3b.4 progress and plateau detection', () => {
  it('e1RM flat across two tests: suggest the next variation for the next block', () => {
    const data = makeData();
    data.maxes.push(test3rm('ohp', 62.5, '2026-12-28'), test3rm('ohp', 62.5, '2027-05-10'));
    const v = day('2027-05-11', data);
    const card = v.insights.find((i) => i.id.startsWith('plateau:ohp'));
    expect(card?.action).toMatchObject({ kind: 'acceptVariant', slot: 'press', lift: 'seated_press', fromBlock: 'M6' });
    expect(card?.why.join(' ')).toMatch(/sleep|Sleep/);
  });
  it('a real gain is not a plateau', () => {
    const data = makeData();
    data.maxes.push(test3rm('ohp', 62.5, '2026-12-28'), test3rm('ohp', 65, '2027-05-10'));
    expect(day('2027-05-11', data).insights.some((i) => i.id.startsWith('plateau'))).toBe(false);
  });
  it('waist up 2 cm in a block with no strength gain: -100 kcal and check sleep', () => {
    const data = makeData();
    data.body.push({ id: 'w1', date: '2027-02-28', waistCm: 86, updatedAt: 1 }, { id: 'w2', date: '2027-03-21', waistCm: 88.5, updatedAt: 1 });
    const v = day('2027-03-22', data); // M4 Build I
    const card = v.insights.find((i) => i.id === 'waist:M4');
    expect(card?.action).toMatchObject({ kind: 'applyKcal', offset: -100 });
    expect(card?.why.join(' ')).toContain('sleep');
  });
});

describe('5.3b.7 load management across the week', () => {
  const hard = (data: Data, date: string, code: 'SPARTAN' | 'VALHALLA' | 'BLADES' | 'LEVIATHAN' | 'GUARDIAN' | 'DRAUPNIR') =>
    setDay(data, date, { checkin: GOOD, readiness: { score: 90, type: 'Full', reasons: [], overridden: false }, sessionDone: true, sessionCode: code });

  it('never two hard leg days in a row', () => {
    const data = makeData();
    hard(data, '2026-10-22', 'SPARTAN'); // Thursday
    data.plan.push({ id: 'sw', kind: 'swap', date: '2026-10-23', weekStart: '2026-10-19', map: { '2026-10-23': 'VALHALLA' }, reason: 't', updatedAt: 1 });
    checkin(data, '2026-10-23', GOOD);
    const v = day('2026-10-23', data);
    expect(v.decision.mods.upper).toBe(true);
    expect(v.decision.why.join(' ')).toContain('Never two hard leg days in a row');
  });
  it('no more than 2 hard leg days in 7', () => {
    const data = makeData();
    hard(data, '2026-10-20', 'SPARTAN');
    hard(data, '2026-10-22', 'VALHALLA');
    data.plan.push({ id: 'sw', kind: 'swap', date: '2026-10-24', weekStart: '2026-10-19', map: { '2026-10-24': 'SPARTAN' }, reason: 't', updatedAt: 1 });
    checkin(data, '2026-10-24', GOOD);
    expect(day('2026-10-24', data).decision.mods.upper).toBe(true);
  });
  it('at least one full rest day: after 6 lifting days in a row, Recovery', () => {
    const data = makeData();
    const codes = ['BLADES', 'LEVIATHAN', 'GUARDIAN', 'SPARTAN', 'DRAUPNIR', 'VALHALLA'] as const;
    codes.forEach((c, i) => hard(data, addDays('2026-10-20', i), c));
    checkin(data, '2026-10-26', GOOD);
    expect(day('2026-10-26', data).decision.type).toBe('Recovery');
  });
  it('a normal week passes: Thursday and Saturday legs stay Full', () => {
    const data = makeData();
    hard(data, '2026-10-19', 'BLADES');
    hard(data, '2026-10-20', 'LEVIATHAN');
    hard(data, '2026-10-21', 'GUARDIAN');
    checkin(data, '2026-10-22', GOOD);
    expect(day('2026-10-22', data).decision.type).toBe('Full');
    hard(data, '2026-10-22', 'SPARTAN');
    hard(data, '2026-10-23', 'DRAUPNIR');
    checkin(data, '2026-10-24', GOOD);
    expect(day('2026-10-24', data).decision.type).toBe('Full');
  });
});

describe('scheduling rules', () => {
  it('3+ Light or Recovery days: offer an early reload', () => {
    const data = makeData();
    for (const d of ['2026-11-02', '2026-11-03', '2026-11-04']) setDay(data, d, { checkin: GOOD, readiness: { score: 55, type: 'Light', reasons: [], overridden: false } });
    checkin(data, '2026-11-05', GOOD);
    const v = day('2026-11-05', data);
    expect(v.insights.some((i) => i.action?.kind === 'startReload')).toBe(true);
    data.plan.push({ id: 'r', kind: 'reload', date: '2026-11-05', until: '2026-11-08', updatedAt: 1 });
    expect(day('2026-11-06', data).pos.weekType).toMatchObject({ reload: true, early: true });
    expect(day('2026-11-09', data).pos.weekType.reload).toBe(false);
  });
  it('3-night sleep under 6.5 h: card and a sleep task in Mind', () => {
    const data = makeData();
    for (const d of ['2026-11-02', '2026-11-03', '2026-11-04']) checkin(data, d, { sleepMin: 360 });
    const v = day('2026-11-04', data);
    expect(v.insights.some((i) => i.title === 'Sleep is the limiter this week')).toBe(true);
    expect(v.tasks.mind.some((t) => t.id === 'sleep')).toBe(true);
  });
  it('under 6,000 steps yesterday: 20 min walk after lunch', () => {
    const data = makeData();
    setDay(data, '2026-11-02', { steps: 4200 });
    expect(day('2026-11-03', data).tasks.training.map((t) => t.label)).toContain('20 min walk after lunch');
  });
  it('cardio short by Friday: card; Saturday gets the missing easy minutes', () => {
    const data = makeData();
    const fri = day('2026-10-23', data);
    expect(fri.insights.some((i) => i.id.startsWith('cardio:'))).toBe(true);
    const sat = day('2026-10-24', data);
    expect(sat.tasks.training.map((t) => t.label)).toContain('Easy cardio 30 min after VALHALLA');
  });
  it('insights: at most 3 on Today, safety first', () => {
    const data = makeData();
    checkin(data, '2026-11-02', { ...GOOD, backPain: 6 });
    checkin(data, '2026-11-03', { ...GOOD, backPain: 6 });
    const v = day('2026-11-03', data);
    const list = buildInsights({ date: v.date, now: new Date('2026-11-03T08:00:00'), pos: v.pos, data, type: v.decision.type, doctor: true, offer: null, tests: [], easyDays: 0, nutrition: v.nutrition, cardio: v.cardio });
    expect(list[0].area).toBe('safety');
    for (let i = 1; i < list.length; i++) expect(list[i - 1].priority).toBeGreaterThanOrEqual(list[i].priority);
  });
  it('calorie suggestion from the 14-day trend, never automatic', () => {
    const data = makeData();
    // Cut block M1: losing about 0.8 kg a week -> +150 kcal.
    const weigh = (d: string, kg: number) => data.body.push({ id: d, date: d, weightKg: kg, updatedAt: 1 });
    // Evaluated on block day 14 (2 Nov): 7-day average then vs 14 days earlier.
    weigh('2026-10-15', 87.1); weigh('2026-10-17', 87); weigh('2026-10-19', 86.9);
    weigh('2026-10-29', 85.5); weigh('2026-10-31', 85.4); weigh('2026-11-02', 85.3);
    const v = day('2026-11-06', data);
    const card = v.insights.find((i) => i.action?.kind === 'applyKcal');
    expect(card?.action).toMatchObject({ offset: 150 });
    expect(v.targets.kcal).toBe(2600);
    data.kcalAdjust.push({ id: 'k', block: 'M1', offsetKcal: 150, date: '2026-11-06', reason: 'x', sourceId: card!.id, updatedAt: 1 });
    const after = day('2026-11-06', data);
    expect(after.targets).toMatchObject({ kcal: 2750, c: 280 + 38 });
    expect(after.insights.some((i) => i.action?.kind === 'applyKcal')).toBe(false);
  });
  it('missing weigh-ins: says so instead of guessing', () => {
    const data = makeData();
    const v = day('2026-11-06', data);
    expect(v.nutrition.missing).toMatch(/Need 3 weigh-ins/);
    expect(v.nutrition.suggestion).toBeNull();
  });
  it('decide() returns Rest on Sunday and before the start', () => {
    const data = makeData();
    expect(decide({ date: '2026-10-25', code: null, data, calibration: { offset: 0, active: false, history: [] }, status: 'active' }).type).toBe('Rest');
    expect(day('2026-10-18', data).decision.type).toBe('Rest');
  });
});
