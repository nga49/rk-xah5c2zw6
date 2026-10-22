// Phase 3: the adaptation engine. Synthetic regions, sides, phases and dates only; never a real case.
import { describe, expect, it } from 'vitest';
import { addDays } from '../src/engine/dates';
import type { Data } from '../src/engine/model';
import { getPosition } from '../src/engine/position';
import { buildSessionCore, modsForType, type BuildInput, type SessionPlan } from '../src/engine/session';
import { computeDay } from '../src/engine/today';
import { guardian, weekVolume } from '../src/recovery/goal';
import { recoveryHook } from '../src/recovery/hook';
import { LOWER_LIMB, type Injury, type Phase, type Region } from '../src/recovery/model';
import { RULES } from '../src/recovery/rules';
import { DRILL_TAGS } from '../src/recovery/mobility';
import { BACK_RESET, MOBILITY_DAILY } from '../src/plan/content';
import { tagsFor } from '../src/recovery/tags';
import { YOKE } from '../src/recovery/volume';
import { canonical, morning } from './fixtures';
import { checkin, makeData, setDay, weight } from './helpers';
import { event, injCheckin, injury, moduleData } from './recovery-helpers';

const MON = '2027-05-10';
const WEEK = [...Array(7).keys()].map((i) => addDays(MON, i));
const LEG_DAYS = [addDays(MON, 3), addDays(MON, 5)];
const START = '2027-05-03';

function injured(region: Region, phase: Phase = 'protect', over: Partial<Injury> = {}, extra: Parameters<typeof moduleData>[0] = {}, base?: Data): { data: Data; inj: Injury } {
  const inj = injury({ region, side: 'right', start: START, ...over });
  const records = [event(inj, START, { event: 'phase', phase }), ...(extra.records ?? [])];
  return { data: moduleData({ ...extra, injuries: [inj, ...(extra.injuries ?? [])], records }, base), inj };
}

const day = (data: Data, d: string) => computeDay(d, data, morning(d));
const served = (s: SessionPlan) => s.exercises.filter((e) => !e.key.startsWith('REHAB:'));

describe('engine: protecting an area', () => {
  const regions: Region[] = ['quad', 'hamstring', 'calf', 'knee', 'lower-back', 'shoulder', 'forearm'];

  it('in Protect, nothing served loads the area, primary or secondary, on any day', () => {
    for (const r of regions) {
      const { data } = injured(r);
      for (const d of WEEK) {
        for (const e of served(day(data, d).session)) {
          const tg = tagsFor(e.name);
          expect([r, d, e.name, !!tg]).toEqual([r, d, e.name, true]);
          expect([r, d, e.name, [...tg!.regions, ...tg!.regions2].includes(r)]).toEqual([r, d, e.name, false]);
        }
      }
    }
  });

  it('in Load, nothing served loads the area as a primary region, and rehab rows appear', () => {
    for (const r of regions) {
      const { data } = injured(r, 'load');
      const s = day(data, LEG_DAYS[0]).session;
      for (const e of served(s)) expect([r, e.name, tagsFor(e.name)!.regions.includes(r)]).toEqual([r, e.name, false]);
      expect(s.exercises.some((e) => e.key.startsWith('REHAB:') && e.load === null && !!e.conditional)).toBe(true);
    }
  });

  it('protected rows are listed as skipped with the reason, and leg days read Upper only for a leg injury', () => {
    const { data } = injured('hamstring');
    for (const d of LEG_DAYS) {
      const v = day(data, d);
      expect(v.decision.type).toBe('Upper only');
      expect(v.decision.canUseFull).toBe(false);
      expect(v.session.skipped.some((s) => s.why.startsWith('Protected: Right hamstring · Protect'))).toBe(true);
      expect(v.session.notes[0]).toMatch(/^Injury plan: Right hamstring · Protect/);
    }
    // An upper day keeps its label.
    expect(day(data, MON).decision.type).toBe('Full');
  });

  it('names and keys stay unique, module rows carry their prefixes, and the core output is never mutated', () => {
    const { data } = injured('calf');
    for (const d of WEEK) {
      const v = day(data, d);
      const s = v.session;
      expect(new Set(s.exercises.map((e) => e.name)).size).toBe(s.exercises.length);
      expect(new Set(s.exercises.map((e) => e.key)).size).toBe(s.exercises.length);
      const coreKeys = new Set(buildSessionCore({ date: d, code: v.code, pos: v.pos, mods: v.decision.mods, data, tests: [] }).exercises.map((e) => e.key));
      for (const e of s.exercises) if (!coreKeys.has(e.key)) expect(e.key).toMatch(/^(REC|REHAB|GOAL|test):/);
    }
    const pos = getPosition(LEG_DAYS[0], data.plan);
    const input: BuildInput = { date: LEG_DAYS[0], code: 'SPARTAN', pos, mods: modsForType('Full'), data };
    const before = canonical(buildSessionCore(input));
    let captured: SessionPlan | null = null;
    recoveryHook(input, (i) => (captured = buildSessionCore(i)));
    expect(canonical(captured)).toBe(before);
  });

  it('is date-aware: before the start date the day equals the original', () => {
    const { data } = injured('quad');
    const plain = makeData();
    for (const d of [addDays(START, -1), addDays(START, -3)]) expect(canonical(day(data, d).session)).toBe(canonical(day(plain, d).session));
  });

  it('a clinician-blocked movement is never served, whatever the region', () => {
    const { data } = injured('other', 'build', { restrictions: { blocked: ['overhead', 'spinal-load'] } });
    for (const d of WEEK) for (const e of served(day(data, d).session)) expect([e.name, tagsFor(e.name)!.moves.some((m) => m === 'overhead' || m === 'spinal-load')]).toEqual([e.name, false]);
  });

  it('long-term limits restrict only what the module adds, unless they apply to the plan', () => {
    const lim = injury({ region: 'shoulder', side: 'both', start: '2026-01-01', kind: 'longTerm', restrictions: { blocked: ['overhead'] } });
    const { data } = injured('quad', 'protect', {}, { injuries: [lim] });
    const thu = day(data, LEG_DAYS[0]).session;
    for (const e of thu.exercises.filter((x) => x.key.startsWith('GOAL:') || x.key.startsWith('REC:'))) {
      const tg = tagsFor(e.name)!;
      expect([e.name, tg.moves.includes('overhead') || [...tg.regions, ...tg.regions2].includes('shoulder')]).toEqual([e.name, false]);
    }
    // Only a long-term limit, not applied to the plan: the plan is unchanged.
    const only = moduleData({ injuries: [lim] });
    expect(canonical(day(only, MON).session)).toBe(canonical(day(makeData(), MON).session));
    const applied = moduleData({ injuries: [{ ...lim, applyToPlan: true }] });
    for (const e of day(applied, MON).session.exercises) expect([e.name, tagsFor(e.name)!.moves.includes('overhead')]).toEqual([e.name, false]);
  });
});

describe('engine: red flags', () => {
  it('a stop-everything flag pauses all training, removes walks and steps, and says seek care', () => {
    const { data, inj } = injured('calf', 'load', { atLog: { flags: ['limb-swelling-warmth'] } });
    for (const d of WEEK) {
      const v = day(data, d);
      expect(v.session.exercises).toEqual([]);
      expect(v.session.cardio).toEqual([]);
      if (v.code) expect(v.decision.type).toBe('Recovery');
      expect(v.tasks.training.some((t) => t.id === 'steps' || t.id === 'walk-lunch' || t.id.startsWith('cardio:'))).toBe(false);
      expect(v.insights.find((i) => i.id === `rec:flag:${inj.id}:${d}`)?.dismissible).toBe(false);
    }
    expect(day(data, MON).tasks.training.find((t) => t.id === 'session')?.label).toBe('Training paused · seek care');
  });

  it('an area flag stops everything that loads the area, rehab included, and keeps the rest', () => {
    const { data } = injured('knee', 'build', { atLog: { flags: ['cannot-straighten-or-slr'] } });
    const thu = day(data, LEG_DAYS[0]).session;
    expect(thu.exercises.some((e) => e.key.startsWith('REHAB:'))).toBe(false);
    for (const e of thu.exercises) expect([e.name, [...tagsFor(e.name)!.regions, ...tagsFor(e.name)!.regions2].includes('knee')]).toEqual([e.name, false]);
    expect(day(data, MON).session.exercises.length).toBeGreaterThan(3);
  });

  it('an assessment dated after the flag clears it; days alone never do', () => {
    const { data, inj } = injured('knee', 'build', { atLog: { flags: ['cannot-straighten-or-slr'] } });
    expect(day(data, addDays(MON, 20)).insights.some((i) => i.id.startsWith('rec:flag:'))).toBe(true);
    data.recovery!.records.push(event(inj, MON, { event: 'assessed', by: 'clinician' }));
    const fresh = { ...data, recovery: { ...data.recovery! } };
    expect(day(fresh, addDays(MON, 1)).insights.some((i) => i.id.startsWith('rec:flag:'))).toBe(false);
  });
});

describe('engine: phases move on symptoms', () => {
  it('a failed pain check steps the area down for that day', () => {
    const { data, inj } = injured('hamstring', 'load', {}, {});
    const passing = day(data, LEG_DAYS[0]).session;
    data.recovery!.checkins.push(injCheckin(inj, LEG_DAYS[0], { painSession: 6 }));
    const failing = day({ ...data, recovery: { ...data.recovery! } }, LEG_DAYS[0]).session;
    const hits = (s: SessionPlan) => served(s).filter((e) => tagsFor(e.name)!.regions2.includes('hamstring')).length;
    expect(hits(failing)).toBe(0);
    expect(hits(passing)).toBeGreaterThan(0);
  });

  it('suggests Load only after the floor, calm check-ins and the functional tests; the owner confirms', () => {
    const { data, inj } = injured('calf', 'protect', { start: addDays(MON, -1) });
    data.recovery!.records = [event(inj, addDays(MON, -1), { event: 'phase', phase: 'protect' })];
    const calm = (d: string) => injCheckin(inj, d, { painRest: 1, painWalk: 2, tests: { 'full-weight-bearing': true, 'straight-leg-raise': true } });
    data.recovery!.checkins.push(calm(MON), calm(addDays(MON, 1)));
    const early = day({ ...data, recovery: { ...data.recovery! } }, addDays(MON, 1));
    expect(early.insights.some((i) => i.id === `rec:step:${inj.id}:load`)).toBe(false);
    data.recovery!.checkins.push(calm(addDays(MON, 2)));
    const later = day({ ...data, recovery: { ...data.recovery! } }, addDays(MON, 2));
    expect(later.insights.some((i) => i.id === `rec:step:${inj.id}:load`)).toBe(true);
  });

  it('a snap or pop with no confirmed grade needs a clinician before Return', () => {
    const { data, inj } = injured('calf', 'build', { mechanism: { felt: 'pop' }, start: addDays(MON, -30) });
    data.recovery!.records = [event(inj, addDays(MON, -20), { event: 'phase', phase: 'build' })];
    for (let i = 0; i < 15; i++) data.recovery!.checkins.push(injCheckin(inj, addDays(MON, i - 14), { painRest: 0, painWalk: 0, painSession: 1, confidence: 4 }));
    const v = day({ ...data, recovery: { ...data.recovery! } }, MON);
    const s = v.insights.find((i) => i.id === `rec:step:${inj.id}:return`);
    expect(s?.why.some((w) => w.includes("clinician's go-ahead"))).toBe(true);
  });

  it('Return ramps main lifts from the pre-injury load, at RIR 3, without load feedback', () => {
    const base = makeData();
    weight(base, '2027-04-29', 'Barbell Back Squat', 120, 'clean');
    const { data } = injured('quad', 'return', {}, {}, base);
    const thu = day(data, LEG_DAYS[0]).session;
    const sq = thu.exercises.find((e) => e.name === 'Barbell Back Squat');
    expect(sq?.load?.kg).toBeLessThanOrEqual(60);
    expect(sq?.rir).toBe('3');
    expect(thu.feedbackLifts).not.toContain('squat');
  });
});

describe('engine: the Goal Guardian with legs protected', () => {
  it('yoke, upper back, shoulders and arms still meet the rule (10+ sets on 2+ days, neck 8), and the verdict has a reason', () => {
    for (const r of ['quad', 'hamstring', 'knee'] as Region[]) {
      const { data } = injured(r);
      const vol = weekVolume(MON, data);
      for (const m of [...YOKE, 'Back', 'Front delts', 'Biceps', 'Triceps'] as const) {
        const v = vol.find((x) => x.muscle === m)!;
        expect([r, m, v.status]).toEqual([r, m, 'met']);
        expect(v.projected).toBeGreaterThanOrEqual(v.target);
      }
      expect(vol.some((v) => v.status === 'paused' && !!v.pausedWhy)).toBe(true);
      const g = guardian(MON, data);
      expect(g.reason.length).toBeGreaterThan(5);
      expect(g.parts.volume.status).not.toBe('at-risk');
      expect(g.tradeoffs.some((t) => t.includes('rest this week so the injury can heal'))).toBe(true);
    }
  });

  it('spare capacity goes to the yoke first, never overhead, never close to failure', () => {
    const { data } = injured('quad');
    const fills = WEEK.flatMap((d) => day(data, d).session.exercises.filter((e) => e.key.startsWith('GOAL:')));
    expect(fills.length).toBeGreaterThan(0);
    expect(fills.some((e) => e.muscles.some((m) => YOKE.includes(m as never)))).toBe(true);
    for (const e of fills) {
      expect(tagsFor(e.name)!.moves.includes('overhead')).toBe(false);
      expect(Number(e.rir)).toBeGreaterThanOrEqual(2);
    }
  });

  it('no fills while a red flag is open', () => {
    const { data } = injured('quad', 'protect', { atLog: { flags: ['numbness-spreading'] } });
    for (const d of WEEK) expect(day(data, d).session.exercises.some((e) => e.key.startsWith('GOAL:'))).toBe(false);
  });
});

describe('engine: the rest of the day follows', () => {
  it('a missed leg day is not offered back while the leg is protected', () => {
    const { data } = injured('quad');
    for (const d of WEEK.slice(0, 3)) setDay(data, d, { sessionDone: true, sessionCode: day(data, d).code ?? undefined });
    checkin(data, addDays(MON, 4));
    const fri = day(data, addDays(MON, 4));
    expect(fri.offer).toBeNull();
  });

  it('3RM tests that load a recovering area wait', () => {
    const { data } = injured('quad');
    for (let d = '2027-01-01'; d < '2028-01-01'; d = addDays(d, 7)) {
      const v = day(data, d);
      if (d < START) continue;
      expect(v.tests.some((t) => t.lift === 'squat' || t.lift === 'hipthrust')).toBe(false);
    }
  });

  it('travel days are guarded when an injury is active', () => {
    const { data } = injured('quad');
    setDay(data, MON, { travelMode: true });
    const s = day(data, MON).session;
    expect(s.title).toBe('Travel');
    for (const e of served(s)) expect([...tagsFor(e.name)!.regions, ...tagsFor(e.name)!.regions2].includes('quad')).toBe(false);
  });

  it('falls back safely when the rules fail: upper body only on a leg day, with a warning', () => {
    const { data } = injured('quad');
    const pos = getPosition(LEG_DAYS[0], data.plan);
    let calls = 0;
    const flaky = (i: BuildInput) => {
      calls += 1;
      if (calls === 1) throw new Error('boom');
      return buildSessionCore(i);
    };
    const s = recoveryHook({ date: LEG_DAYS[0], code: 'SPARTAN', pos, mods: modsForType('Full'), data }, flaky);
    expect(s.notes[0]).toMatch(/could not run fully/);
    expect(s.exercises.some((e) => e.muscles.some((m) => m === 'Quads'))).toBe(false);
  });
});

describe('engine: rules carry their sources', () => {
  it('every rule names a source and an evidence level', () => {
    for (const [k, r] of Object.entries(RULES)) {
      expect([k, r.source.length > 3]).toEqual([k, true]);
      expect(['partly', 'plan-rule', 'heuristic', 'unverified']).toContain(r.evidence);
    }
    expect(LOWER_LIMB).toContain('quad');
  });
});

describe('engine: mobility drills follow the injury rules', () => {
  it('every drill in the routines is tagged', () => {
    for (const d of [...MOBILITY_DAILY.drills, ...BACK_RESET.drills]) expect([d.name, !!DRILL_TAGS[d.name]]).toEqual([d.name, true]);
  });

  it('drills that load or stretch a protected area are listed to skip, on the session and the task; walking stays', () => {
    const { data } = injured('quad');
    const v = day(data, MON);
    const note = v.session.notes.find((n) => n.startsWith('Mobility: skip'));
    expect(note).toMatch(/half-kneeling hip flexor stretch/);
    expect(note).toMatch(/dead bug/);
    expect(note).not.toMatch(/thoracic open book|easy walk/);
    expect(v.tasks.training.find((t) => t.id === 'mobility')?.sub).toMatch(/^Skip: /);
    const load = injured('quad', 'load').data;
    expect(day(load, MON).session.notes.find((n) => n.startsWith('Mobility: skip'))).not.toMatch(/dead bug/);
  });
});
