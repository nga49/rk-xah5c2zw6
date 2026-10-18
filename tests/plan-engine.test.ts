// Milestone 2: plan engine. Acceptance tests 1-6, 12, 14, 15 (brief section 8).
import { describe, expect, it } from 'vitest';
import { weeklySets } from '../src/engine/audit';
import { addDays, diffDays, weekday } from '../src/engine/dates';
import { epley, ffmi, leanMass, loadForTarget, roundDown, weeklyAverage } from '../src/engine/formulas';
import { blockRealStart, getPosition, planDateOf, realDateOf } from '../src/engine/position';
import { buildSession, modsForType } from '../src/engine/session';
import { computeDay } from '../src/engine/today';
import { BLOCKS, SEASONS } from '../src/plan';
import { makeData, pause, privateFixture, uid } from './helpers';

const labels = (date: string, data = makeData()) => {
  const v = computeDay(date, data, new Date(`${date}T08:00:00`));
  return { v, training: v.tasks.training.map((t) => t.label), mind: v.tasks.mind.map((t) => t.label) };
};

describe('plan data', () => {
  it('has 36 contiguous blocks over 208 weeks and contiguous seasons', () => {
    expect(BLOCKS).toHaveLength(36);
    for (let i = 1; i < BLOCKS.length; i++) expect(BLOCKS[i].start).toBe(addDays(BLOCKS[i - 1].end, 1));
    for (const b of BLOCKS) expect(diffDays(b.end, b.start) + 1).toBe(b.weeks * 7);
    expect(diffDays(BLOCKS[35].end, BLOCKS[0].start) + 1).toBe(208 * 7);
    for (let i = 1; i < SEASONS.length; i++) expect(SEASONS[i].start).toBe(addDays(SEASONS[i - 1].end, 1));
    expect(SEASONS[0].start).toBe(BLOCKS[0].start);
    expect(SEASONS.at(-1)?.end).toBe(BLOCKS[35].end);
  });
});

describe('acceptance 1-6', () => {
  it('1. 2026-10-18 (Sunday): starts Monday 19 October, block M1, week 1', () => {
    const { v } = labels('2026-10-18');
    expect(weekday('2026-10-18')).toBe(6);
    expect(v.lines.startsOn).toBe('Starts Monday 19 October');
    expect(v.pos.block.code).toBe('M1');
    expect(v.pos.week).toBe(1);
  });

  it('2. 2026-10-19 (Monday): M1 Foundation W1 Settle RIR 3, Strength, BLADES, 2,600 kcal, season 1, block-start tasks', () => {
    const { v, training } = labels('2026-10-19');
    expect(v.pos.status).toBe('active');
    expect(v.pos.block.code).toBe('M1');
    expect(v.pos.block.name).toBe('Foundation');
    expect(v.pos.week).toBe(1);
    expect(v.pos.weekType.name).toBe('Settle');
    expect(v.pos.weekType.rir).toBe('3');
    expect(v.pos.tpl).toBe('S');
    expect(v.session.title).toBe('BLADES');
    expect(v.session.kind).toBe('Push A · heavy');
    expect(v.targets).toMatchObject({ kcal: 2600, p: 190, f: 80, c: 280 });
    expect(v.pos.season.n).toBe(1);
    expect(v.pos.season.name).toBe('The Pause');
    expect(v.lines.position).toBe('Year 1 · Block M1 Foundation · Week 1 of 6 · Settle · RIR 3');
    expect(v.lines.season).toBe('Season 1 · The Pause · Day 1 of 84');
    expect(training).toContain('Weigh-in');
    expect(training).toContain('Mobility 10 min');
    expect(training).toContain('Steps 10,000');
    expect(training).toContain('Photos: front, side, back');
    expect(training).toContain('Update calories in Yazio to 2,600 kcal');
  });

  it('3. 2026-10-21 (Wednesday): GUARDIAN and a "Zone 2, 30 min" task', () => {
    const { v, training } = labels('2026-10-21');
    expect(v.session.title).toBe('GUARDIAN');
    expect(training).toContain('Zone 2, 30 min');
  });

  it('4. 2027-01-04 to 2027-01-10: M2 week 6 reload, rep-max test due', () => {
    for (let d = '2027-01-04'; d <= '2027-01-10'; d = addDays(d, 1)) {
      const { v } = labels(d);
      expect(v.pos.block.code).toBe('M2');
      expect(v.pos.week).toBe(6);
      expect(v.pos.weekType.reload).toBe(true);
      expect(v.tests.filter((t) => !t.done).map((t) => t.lift).sort()).toEqual(['bench', 'ohp', 'pullup', 'squat']);
    }
    const monday = labels('2027-01-04').training;
    expect(monday).toContain('3RM test: OHP');
    expect(monday).toContain('3RM test: Bench');
  });

  it('5. 2027-01-12 (Tuesday): M3 Hold, Volume, LEVIATHAN Pull A volume, 2,750 kcal, Iron Sleep, The Pause still listed', () => {
    const { v, mind } = labels('2027-01-12');
    expect(v.pos.block.code).toBe('M3');
    expect(v.pos.block.name).toBe('Hold');
    expect(v.pos.tpl).toBe('H');
    expect(v.session.title).toBe('LEVIATHAN');
    expect(v.session.kind).toBe('Pull A · volume');
    expect(v.targets.kcal).toBe(2750);
    expect(v.pos.season.n).toBe(2);
    expect(v.pos.season.name).toBe('Iron Sleep');
    expect(mind).toContain('Breathe 5 min'); // The Pause habit
    expect(mind).toContain('Same wake time, 7.5 h in bed');
  });

  it('6. 2027-10-18 (Monday): block 2.1, year 2, season 5 Say It, meditation 20 min', () => {
    const { v, mind } = labels('2027-10-18');
    expect(v.pos.block.code).toBe('2.1');
    expect(v.pos.year).toBe(2);
    expect(v.pos.season.n).toBe(5);
    expect(v.pos.season.name).toBe('Say It');
    expect(mind).toContain('Meditate 20 min');
  });
});

describe('acceptance 12: suggested loads', () => {
  const benchKg = (e1rm: number, type: 'Full' | 'Moderate' | 'Light') => {
    const data = makeData({ bench: e1rm, ohp: 70, squat: 150 });
    const date = '2026-11-02'; // M1 week 3, Monday
    const pos = getPosition(date, data.plan);
    expect(pos.week).toBe(3);
    const s = buildSession({ date, code: 'BLADES', pos, mods: modsForType(type), data });
    const bench = s.exercises.find((e) => e.lift === 'bench');
    expect(bench?.sets).toBe(type === 'Light' ? 4 : 5);
    expect(bench?.reps).toBe(3);
    return bench?.load?.kg;
  };

  it('Strength W3 bench: 85% rounded down to 2.5, then 90% (Moderate) and 75% (Light)', () => {
    // Neutral number: 160 x 0.85 = 136 -> 135; 135 x 0.9 = 121.5 -> 120; 135 x 0.75 = 101.25 -> 100.
    expect(benchKg(160, 'Full')).toBe(135);
    expect(benchKg(160, 'Moderate')).toBe(120);
    expect(benchKg(160, 'Light')).toBe(100);
  });

  const fx = privateFixture();
  it.runIf(!!fx?.bench)('brief numbers from the local private fixture', () => {
    expect(benchKg(fx!.bench!, 'Full')).toBe(fx!.expect!.full);
    expect(benchKg(fx!.bench!, 'Moderate')).toBe(fx!.expect!.moderate);
    expect(benchKg(fx!.bench!, 'Light')).toBe(fx!.expect!.light);
  });

  it('squat never goes above 85% and the reload week uses W1 % with half the sets', () => {
    const data = makeData();
    const w6 = '2026-11-23'; // M1 week 6, Monday
    const pos = getPosition(w6, data.plan);
    expect(pos.weekType.reload).toBe(true);
    const s = buildSession({ date: w6, code: 'BLADES', pos, mods: modsForType('Full'), data });
    const bench = s.exercises.find((e) => e.lift === 'bench');
    expect(bench?.sets).toBe(3);
    expect(bench?.load?.kg).toBe(roundDown(160 * 0.81));
    const thu = '2026-11-19'; // M1 week 5, Thursday: 84%
    const sq = buildSession({ date: thu, code: 'SPARTAN', pos: getPosition(thu, data.plan), mods: modsForType('Full'), data }).exercises.find((e) => e.lift === 'squat');
    expect(sq?.load?.kg).toBe(roundDown(150 * 0.84));
  });

  it('volume lifts use the load-for-target formula with the top of the range', () => {
    const data = makeData();
    const date = '2027-01-12'; // M3 week 1 (RIR 3), Tuesday
    const s = buildSession({ date, code: 'LEVIATHAN', pos: getPosition(date, data.plan), mods: modsForType('Full'), data });
    const shrug = s.exercises.find((e) => e.lift === 'shrug');
    expect(shrug?.reps).toBe('12–15');
    expect(shrug?.load?.kg).toBe(roundDown(loadForTarget(130, 15, 3)));
  });

  it('weighted pull-up: added load = total e1RM x % - bodyweight', () => {
    const data = makeData();
    data.maxes.push({ id: uid(), date: '2026-12-01', lift: 'pullup', weightKg: 30, reps: 3, bodyweightKg: 85, e1rm: epley(115, 3), source: 'test', updatedAt: 3 });
    data.body.push({ id: uid(), date: '2026-12-07', weightKg: 85, updatedAt: 1 });
    const date = '2026-12-08'; // M2 week 2, Tuesday: 80%
    const s = buildSession({ date, code: 'LEVIATHAN', pos: getPosition(date, data.plan), mods: modsForType('Full'), data });
    const pu = s.exercises.find((e) => e.lift === 'pullup');
    expect(pu?.load?.added).toBe(true);
    expect(pu?.load?.kg).toBe(roundDown(epley(115, 3) * 0.8 - 85));
  });

  it('a year 2 variation starts from 90% of the previous lift until tested', () => {
    const data = makeData();
    const date = '2027-12-06'; // block 2.2 (Strength), week 2, Monday: incline bench in year 2
    const s = buildSession({ date, code: 'BLADES', pos: getPosition(date, data.plan), mods: modsForType('Full'), data });
    const ib = s.exercises.find((e) => e.lift === 'incline_bench');
    expect(ib?.name).toBe('Incline Bench Press 30°');
    expect(ib?.load?.kg).toBe(roundDown(160 * 0.9 * 0.83));
  });
});

describe('acceptance 14: pause plan', () => {
  it('pausing 7 days on 2026-11-02 moves M2 from 2026-11-30 to 2026-12-07', () => {
    const data = makeData();
    expect(blockRealStart('M2', data.plan)).toBe('2026-11-30');
    pause(data, '2026-11-02', 7);
    expect(blockRealStart('M2', data.plan)).toBe('2026-12-07');
    expect(getPosition('2026-11-05', data.plan).status).toBe('paused');
    expect(getPosition('2026-12-06', data.plan).block.code).toBe('M1');
    expect(getPosition('2026-12-07', data.plan).block.code).toBe('M2');
    // Seasons slide too.
    expect(getPosition('2027-01-17', data.plan).season.n).toBe(1);
    expect(getPosition('2027-01-18', data.plan).season.n).toBe(2);
    expect(getPosition('2026-12-07', data.plan).pausedDays).toBe(7);
  });

  it('plan and real dates round-trip across several pauses', () => {
    const pauses = [{ date: '2026-11-02', days: 7 }, { date: '2027-02-10', days: 3 }];
    for (let p = '2026-10-19'; p < '2027-06-01'; p = addDays(p, 5)) expect(planDateOf(realDateOf(p, pauses), pauses)).toBe(p);
  });
});

describe('acceptance 15: weekly set audit', () => {
  for (const tpl of ['S', 'H'] as const) {
    it(`${tpl === 'S' ? 'Strength' : 'Volume'}: every muscle 10+ sets (neck 8), each at least twice a week`, () => {
      const v = weeklySets(tpl);
      expect(Object.keys(v).length).toBeGreaterThanOrEqual(15);
      for (const [muscle, { sets, days }] of Object.entries(v)) {
        if (muscle === 'Neck') expect(sets).toBe(8);
        else expect(sets, muscle).toBeGreaterThanOrEqual(10);
        expect(days, muscle).toBeGreaterThanOrEqual(2);
      }
      expect(v.Hamstrings.days).toBeGreaterThanOrEqual(2); // hamstrings on both leg days
    });
  }
  it('matches the program sheet totals', () => {
    expect(weeklySets('S')).toMatchObject({ Traps: { sets: 12 }, 'Side delts': { sets: 14 }, 'Front delts': { sets: 13 }, Chest: { sets: 12 }, Forearms: { sets: 19 }, Core: { sets: 19 }, Quads: { sets: 15 } });
    expect(weeklySets('H')).toMatchObject({ 'Front delts': { sets: 15 }, Chest: { sets: 10 } });
  });
});

describe('formulas (5.2)', () => {
  it('Epley, load for target, lean mass and FFMI', () => {
    expect(epley(100, 3)).toBeCloseTo(110);
    expect(loadForTarget(110, 3, 0)).toBeCloseTo(100);
    expect(roundDown(139.06)).toBe(137.5);
    expect(leanMass(87, 20)).toBeCloseTo(69.6);
    const f = ffmi(69.6, 184);
    expect(f.raw).toBeCloseTo(20.56, 1);
    expect(f.normalized).toBeCloseTo(20.3, 1);
  });
  it('weekly average needs 3 weigh-ins in the last 7 days', () => {
    const body = [
      { id: 'a', date: '2026-10-19', weightKg: 87, updatedAt: 1 },
      { id: 'b', date: '2026-10-21', weightKg: 86.6, updatedAt: 1 },
    ];
    expect(weeklyAverage(body, '2026-10-23')).toBeNull();
    body.push({ id: 'c', date: '2026-10-23', weightKg: 86.5, updatedAt: 1 });
    expect(weeklyAverage(body, '2026-10-23')).toBeCloseTo(86.7);
  });
});

describe('rotation (5.10, 6.5)', () => {
  it('accessories rotate by block index and keep the original name', () => {
    const data = makeData();
    const m2 = '2026-12-01'; // M2 = block index 1, Tuesday
    const s = buildSession({ date: m2, code: 'LEVIATHAN', pos: getPosition(m2, data.plan), mods: modsForType('Full'), data });
    const row = s.exercises.find((e) => e.originalName === 'Chest Supported Dumbbell Row');
    expect(row?.name).toBe('Chest-supported T-bar Row');
  });
  it('safety-bar squat only when the gym has one', () => {
    const data = makeData();
    const thu = '2027-12-02'; // block 2.2, Thursday
    const plain = buildSession({ date: thu, code: 'SPARTAN', pos: getPosition(thu, data.plan), mods: modsForType('Full'), data });
    expect(plain.exercises[0].name).toBe('Barbell Back Squat');
    data.profile = { ...data.profile!, safetyBar: true };
    const ssb = buildSession({ date: thu, code: 'SPARTAN', pos: getPosition(thu, data.plan), mods: modsForType('Full'), data });
    expect(ssb.exercises[0].name).toBe('Safety-bar Squat');
  });
});
