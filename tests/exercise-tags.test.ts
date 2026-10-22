// Phase 2: every exercise the plan can serve is tagged, and the tags are internally consistent.
import { describe, expect, it } from 'vitest';
import { getPosition } from '../src/engine/position';
import { SESSION_TYPES } from '../src/engine/model';
import { buildSessionCore, modsForType } from '../src/engine/session';
import { ACCESSORY_OPTIONS, BLOCKS, LIFTS, ROTATION, TEMPLATES, WEEKDAY_SESSIONS, type LiftKey } from '../src/plan';
import { TRAVEL_SESSION, TRAVEL_WEDNESDAY } from '../src/plan/content';
import { addDays } from '../src/engine/dates';
import type { SessionCode } from '../src/plan/types';
import { MOVEMENTS, REGIONS } from '../src/recovery/model';
import { DEPTHS, EXERCISE_TAGS, LEVELS, tagsFor, type ExerciseTags } from '../src/recovery/tags';
import { makeData } from './helpers';

/** Names that existing swaps write into a session (src/engine/session.ts spineSwap and kneeSwap). */
const SWAP_TARGETS = ['Leg Press', 'Seated Dumbbell Press', 'Seated Dumbbell Shrug', 'Dead Bug', 'Weighted Seated Calf Raise', 'Barbell Hip Thrust with Bench', '45° Back Extension', 'Leg Curl', 'Walk'];
const SLOT_TEMPLATES = new Set(Object.values(ROTATION).map((r) => r.template));
const TEMPLATE_DAYS = [...TEMPLATES.strength, ...TEMPLATES.volume_overrides];
const rank = <T,>(list: T[], v: T) => list.indexOf(v);

/** Every name the plan data and the engine can put in a session, read from the sources. */
function staticNames(): string[] {
  const out = new Set<string>(SWAP_TARGETS);
  for (const d of TEMPLATE_DAYS) for (const e of d.exercises) (ACCESSORY_OPTIONS[e.name] ?? [e.name]).forEach((n) => out.add(n));
  for (const l of Object.values(LIFTS)) out.add(l.name);
  for (const e of [...TRAVEL_SESSION, ...TRAVEL_WEDNESDAY]) out.add(e.name);
  return [...out];
}

/** Every name actually served: all blocks, codes and session types, with and without the optional bars, plus every 3RM test. */
function servedNames(): Set<string> {
  const out = new Set<string>();
  const codes = WEEKDAY_SESSIONS.filter((c): c is SessionCode => !!c);
  const lifts = Object.keys(LIFTS) as LiftKey[];
  for (const gear of [false, true]) {
    const data = makeData();
    if (data.profile) data.profile = { ...data.profile, safetyBar: gear, beltSquat: gear };
    for (const b of BLOCKS) {
      const date = addDays(b.start, 8);
      const pos = getPosition(date, data.plan);
      if (pos.status !== 'active') continue;
      for (const code of codes) {
        for (const type of SESSION_TYPES) {
          const s = buildSessionCore({ date, code, pos, mods: modsForType(type), data, backPain: type === 'Spine-sparing' ? 3 : 0, tests: lifts.map((lift) => ({ lift, plannedOn: date })) });
          s.exercises.forEach((e) => out.add(e.name));
          s.skipped.forEach((e) => out.add(e.name));
        }
      }
    }
  }
  return out;
}

describe('exercise tags: coverage', () => {
  it('every name in the plan data, the lifts, travel and the existing swaps is tagged', () => {
    const missing = staticNames().filter((n) => !EXERCISE_TAGS[n]);
    expect(missing).toEqual([]);
  });

  it('every exercise served across blocks, codes, session types and equipment is tagged, 3RM tests included', () => {
    const served = servedNames();
    expect(served.size).toBeGreaterThan(80);
    expect([...served].filter((n) => !tagsFor(n))).toEqual([]);
  }, 120_000);

  it('unknown names return null, so callers can treat them as the worst case', () => {
    expect(tagsFor('Something new')).toBeNull();
    expect(tagsFor('3RM test: Barbell Back Squat')).toBe(EXERCISE_TAGS['Barbell Back Squat']);
  });
});

describe('exercise tags: consistency', () => {
  const all = Object.entries(EXERCISE_TAGS);

  it('uses only known regions, movements, levels and depths', () => {
    for (const [, tg] of all) {
      for (const r of [...tg.regions, ...tg.regions2]) expect(REGIONS).toContain(r);
      for (const m of tg.moves) expect(MOVEMENTS).toContain(m);
      expect(LEVELS).toContain(tg.spinalLoad);
      expect(LEVELS).toContain(tg.impact);
      expect(DEPTHS).toContain(tg.kneeFlexion);
      expect(tg.kit.length).toBeGreaterThan(0);
    }
  });

  it('names the spine-load movement exactly when the spinal load is moderate or high', () => {
    for (const [name, tg] of all) expect([name, tg.moves.includes('spinal-load')]).toEqual([name, tg.spinalLoad === 'moderate' || tg.spinalLoad === 'high']);
  });

  it('heavy standing work loads the legs, and hip flexion work lists the quad', () => {
    for (const [name, tg] of all) {
      const any = [...tg.regions, ...tg.regions2];
      if (rank(LEVELS, tg.spinalLoad) >= 2 && !tg.supported) expect([name, any.includes('knee')]).toEqual([name, true]);
      if (tg.moves.includes('hip-flexion')) expect([name, any.includes('quad')]).toEqual([name, true]);
    }
  });

  it('regressions and alternatives point to tagged names, with no cycles', () => {
    for (const [name, tg] of all) {
      for (const r of [...(tg.regressions ?? []), ...(tg.alternatives ?? [])]) {
        expect([name, r, !!EXERCISE_TAGS[r]]).toEqual([name, r, true]);
        expect(r).not.toBe(name);
      }
    }
    const visit = (name: string, path: string[]): void => {
      expect(path).not.toContain(name);
      for (const r of EXERCISE_TAGS[name].regressions ?? []) visit(r, [...path, name]);
    };
    for (const [name] of all) visit(name, []);
  });

  it('a regression is never harder: no more spinal load, impact or knee bend, no new loaded region, no less support', () => {
    const harder = (a: ExerciseTags, b: ExerciseTags) =>
      rank(LEVELS, b.spinalLoad) > rank(LEVELS, a.spinalLoad) ||
      rank(LEVELS, b.impact) > rank(LEVELS, a.impact) ||
      rank(DEPTHS, b.kneeFlexion) > rank(DEPTHS, a.kneeFlexion) ||
      b.regions.some((r) => !a.regions.includes(r) && !a.regions2.includes(r)) ||
      (a.supported && !b.supported);
    for (const [name, tg] of all) for (const r of tg.regressions ?? []) expect([name, r, harder(tg, EXERCISE_TAGS[r])]).toEqual([name, r, false]);
  });

  it('primary muscles include the template muscles wherever the name is served', () => {
    for (const d of TEMPLATE_DAYS) {
      for (const e of d.exercises) {
        const names = SLOT_TEMPLATES.has(e.name)
          ? Object.values(ROTATION).find((r) => r.template === e.name)!.years.map((l) => LIFTS[l].name)
          : ACCESSORY_OPTIONS[e.name] ?? [e.name];
        for (const n of names) for (const m of e.muscles) expect([n, m, EXERCISE_TAGS[n].primary.includes(m as never)]).toEqual([n, m, true]);
      }
    }
  });

  it('travel rows keep exactly their own muscle labels, so travel weeks count the same', () => {
    for (const e of [...TRAVEL_SESSION, ...TRAVEL_WEDNESDAY]) expect([e.name, [...EXERCISE_TAGS[e.name].primary].sort()]).toEqual([e.name, [...e.muscles].sort()]);
  });

  it('circuits are tagged at their worst part', () => {
    const circuits = all.filter(([n]) => /goblet squat|thruster/i.test(n));
    expect(circuits.length).toBeGreaterThan(0);
    for (const [, tg] of circuits) {
      expect(rank(LEVELS, tg.spinalLoad)).toBeGreaterThanOrEqual(2);
      expect(tg.kneeFlexion).toBe('deep');
      expect(tg.moves).toEqual(expect.arrayContaining(['squat', 'overhead', 'horizontal-pull']));
      expect(tg.regions).toEqual(expect.arrayContaining(['quad', 'knee', 'shoulder', 'lower-back']));
    }
  });
});
