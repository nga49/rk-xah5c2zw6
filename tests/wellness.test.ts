// Phase 4: wellness and possible accumulated fatigue. Synthetic dates and values only.
import { describe, expect, it } from 'vitest';
import { addDays } from '../src/engine/dates';
import type { Data } from '../src/engine/model';
import { computeDay } from '../src/engine/today';
import { guardian } from '../src/recovery/goal';
import type { RecoveryRecord } from '../src/recovery/model';
import { fatigueOn, FATIGUE } from '../src/recovery/wellness';
import { canonical, morning } from './fixtures';
import { checkin, makeData } from './helpers';
import { injury, event, moduleData, wellness } from './recovery-helpers';

const MON = '2027-05-10';
const day = (data: Data, d: string) => computeDay(d, data, morning(d));

describe('wellness: signals and levels', () => {
  it('one sign told as going on for several days is a single signal: no watch, no change to sessions, a coach note', () => {
    const data = moduleData({ wellness: [wellness(MON, { signs: { eyeTwitch: true }, signDays: 5 })] });
    const f = fatigueOn(MON, data);
    expect(f.level).toBe('none');
    expect(f.twitch).toBe(true);
    expect(f.persistDays).toBe(5);
    expect(canonical(day(data, MON).session)).toBe(canonical(day(makeData(), MON).session));
    expect(day(data, MON).insights.some((i) => i.id.startsWith('rec:twitch:'))).toBe(true);
  });

  it('two signs on three days is a watch: no extra volume, sessions otherwise unchanged', () => {
    const inj = injury({ region: 'quad', side: 'left', start: '2027-05-03' });
    const sign = (d: string) => wellness(d, { signs: { jittery: true, restlessSleep: true } });
    const base = { injuries: [inj], records: [event(inj, '2027-05-03', { event: 'phase', phase: 'protect' })] };
    const watched = moduleData({ ...base, wellness: [sign(addDays(MON, -2)), sign(addDays(MON, -1)), sign(MON)] });
    expect(fatigueOn(MON, watched).level).toBe('watch');
    const thu = addDays(MON, 3);
    expect(fatigueOn(thu, watched).level).toBe('watch');
    expect(day(watched, thu).session.exercises.some((e) => e.key.startsWith('GOAL:'))).toBe(false);
    // The watch ends when the signs leave the 7-day window.
    expect(fatigueOn(addDays(MON, 5), watched).level).toBe('none');
    expect(day(moduleData(base), thu).session.exercises.some((e) => e.key.startsWith('GOAL:'))).toBe(true);
  });

  it('the overtrained tap plus one sign is a flag: a block is offered, but sessions change only once it is accepted', () => {
    const data = moduleData({ wellness: [wellness(MON, { overtrained: true, signs: { poorFocus: true } })] });
    const f = fatigueOn(MON, data);
    expect(f.level).toBe('flag');
    expect(f.offer?.until).toBe(addDays(MON, FATIGUE.blockDays - 1));
    const v = day(data, MON);
    expect(v.insights.some((i) => i.id === `rec:block:${MON}`)).toBe(true);
    expect(canonical(v.session.exercises)).toBe(canonical(day(makeData(), MON).session.exercises));
  });

  it('readiness history counts: short sleep and low HRV add up with logged signs', () => {
    const data = moduleData({ wellness: [MON, addDays(MON, -1), addDays(MON, -2)].map((d) => wellness(d, { signs: { irritable: true } })) });
    for (const d of [MON, addDays(MON, -1), addDays(MON, -2)]) checkin(data, d, { sleepMin: 340, hrvStatus: 'low' });
    const f = fatigueOn(MON, data);
    expect(f.today).toEqual(expect.arrayContaining(['Irritable', 'HRV low', 'Short sleep, 3-night average under 6 h 30']));
    expect(f.level).not.toBe('none');
  });

  it('signs for 14 days or more suggest seeing a doctor', () => {
    const data = moduleData({ wellness: [wellness(MON, { signs: { lowMotivation: true }, signDays: 15 })] });
    expect(fatigueOn(MON, data).doctor).toBe(true);
    expect(day(data, MON).insights.some((i) => i.id.startsWith('rec:doctor:'))).toBe(true);
  });
});

describe('wellness: an accepted recovery block', () => {
  const block = (level: 'moderate' | 'light'): RecoveryRecord => ({ id: 'b1', kind: 'recoveryBlock', date: MON, until: addDays(MON, 4), level, reason: 'possible accumulated fatigue', updatedAt: 1 });

  it('lowers the day, adds a rep in reserve, drops tests and never adds volume; plan blocks are untouched', () => {
    const plain = makeData();
    const data = moduleData({ records: [block('moderate')] });
    for (let i = 0; i < 5; i++) {
      const d = addDays(MON, i);
      const a = day(data, d);
      const o = day(plain, d);
      if (!o.code) continue;
      expect(a.decision.type).not.toBe('Full');
      expect(a.session.exercises.some((e) => e.role === 'test' || e.key.startsWith('GOAL:'))).toBe(false);
      const sets = (s: typeof a.session) => s.exercises.filter((e) => e.role !== 'test').reduce((n, e) => n + e.sets, 0);
      expect(sets(a.session)).toBeLessThanOrEqual(sets(o.session));
      expect(a.session.notes[0]).toMatch(/^Recovery block until/);
      expect(a.pos.block.code).toBe(o.pos.block.code);
    }
    expect(day(data, addDays(MON, 5)).decision.type).toBe(day(plain, addDays(MON, 5)).decision.type);
  });

  it('the Guardian says the set floors are paused and why', () => {
    const g = guardian(MON, moduleData({ records: [block('light')] }));
    expect(g.parts.volume.reason).toMatch(/recovery block/);
    expect(g.tradeoffs.some((t) => t.startsWith('Recovery block'))).toBe(true);
  });
});
