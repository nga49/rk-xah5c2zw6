// A week that slid: the missed session done on another day, then today's session picked by hand.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { RagnarokDB, useDatabase } from '../src/db/db';
import { loadData, put, saveProfile } from '../src/db/store';
import { scheduledCode, skippedThisWeek, todayChoices, weekWith, withChoice } from '../src/engine/schedule';
import { computeDay } from '../src/engine/today';
import { PLAN_START } from '../src/plan';
import { weekVolume } from '../src/recovery/goal';
import { applyAction, chooseSession, undoWeekChange } from '../src/state/actions';
import { checkin, makeData, profile, setDay, uid } from './helpers';

const MON = '2026-11-02';
const TUE = '2026-11-03';
const WED = '2026-11-04';
const THU = '2026-11-05';
const at = (d: string) => new Date(`${d}T08:00:00`);
// Tuesday's accepted offer, as the app stored it: BLADES moved to Tuesday, GUARDIAN dropped.
const TUESDAY_SWAP = { [TUE]: 'BLADES', [WED]: 'LEVIATHAN', '2026-11-05': 'SPARTAN', '2026-11-06': 'DRAUPNIR', '2026-11-07': 'VALHALLA' } as const;

function slidWeek() {
  const data = makeData();
  data.plan.push({ id: uid('swap'), kind: 'swap', date: TUE, weekStart: MON, map: { ...TUESDAY_SWAP }, reason: 'Missed BLADES', updatedAt: 1 });
  setDay(data, TUE, { sessionDone: true, sessionCode: 'BLADES' });
  checkin(data, THU);
  return data;
}

describe('the missed-session offer', () => {
  it('never offers a session already done this week, and offers the one really missed', () => {
    const v = computeDay(THU, slidWeek(), at(THU));
    expect(v.offer?.missed).toBe('LEVIATHAN');
    expect(v.offer?.missedOn).toBe(WED);
    expect(v.offer?.map).toEqual({ [THU]: 'LEVIATHAN', '2026-11-06': 'SPARTAN', '2026-11-07': 'DRAUPNIR' });
    expect(v.offer?.lines).toEqual(['Friday: SPARTAN', 'Saturday: DRAUPNIR', 'Skipped this week: VALHALLA']);
  });

  it('is gone once the missed session is today\'s', () => {
    const data = slidWeek();
    data.plan.push({ id: uid('swap'), kind: 'swap', date: THU, weekStart: MON, map: { ...TUESDAY_SWAP, [THU]: 'LEVIATHAN' }, reason: 'x', updatedAt: 2 });
    expect(computeDay(THU, data, at(THU)).offer).toBeNull();
  });
});

describe('picking today\'s session', () => {
  it('offers every session still owed this week, today\'s first, and not the ones done', () => {
    const { choices, done } = todayChoices(THU, slidWeek(), PLAN_START);
    expect(choices.map((c) => c.code)).toEqual(['SPARTAN', 'LEVIATHAN', 'GUARDIAN', 'DRAUPNIR', 'VALHALLA', null]);
    expect([...done]).toEqual([['BLADES', TUE]]);
  });

  it('LEVIATHAN today puts SPARTAN tomorrow, and keeps the days already gone', () => {
    const c = weekWith(THU, slidWeek(), 'LEVIATHAN', PLAN_START)!;
    expect(c.rest).toEqual([{ date: '2026-11-06', code: 'SPARTAN' }, { date: '2026-11-07', code: 'DRAUPNIR' }]);
    expect(c.skipped).toEqual(['GUARDIAN', 'VALHALLA']);
    expect(c.map[TUE]).toBe('BLADES');
    expect(c.warning).toBeNull();
  });

  it('never puts two leg days in a row after a leg day picked by hand', () => {
    const c = weekWith(THU, slidWeek(), 'SPARTAN', PLAN_START)!;
    expect(c.rest.map((r) => r.code)).toEqual(['LEVIATHAN', 'VALHALLA']);
  });

  it('rest today slides the heavy sessions into the days left', () => {
    const c = weekWith(THU, slidWeek(), null, PLAN_START)!;
    expect(c.map[THU]).toBeNull();
    expect(c.rest.map((r) => r.code)).toEqual(['LEVIATHAN', 'SPARTAN']);
    expect(c.skipped).toEqual(['GUARDIAN', 'DRAUPNIR', 'VALHALLA']);
  });

  it('warns about legs two days running', () => {
    const data = slidWeek();
    setDay(data, WED, { sessionDone: true, sessionCode: 'SPARTAN' });
    expect(weekWith(THU, data, 'VALHALLA', PLAN_START)?.warning).toBe('Legs again: SPARTAN was yesterday.');
  });

  it('the goal volume reacts to the choice: resting today drops DRAUPNIR and its side-delt sets', () => {
    const data = slidWeek();
    const delts = (code: 'LEVIATHAN' | null) => weekVolume(THU, withChoice(data, THU, weekWith(THU, data, code, PLAN_START)!)).find((v) => v.muscle === 'Side delts')!.projected;
    expect(delts('LEVIATHAN')).toBeGreaterThan(delts(null));
  });

  it('lists what no longer fits this week, on any day of it', () => {
    expect(skippedThisWeek(THU, slidWeek(), PLAN_START)).toEqual(['LEVIATHAN', 'GUARDIAN']);
    expect(skippedThisWeek('2026-11-08', slidWeek(), PLAN_START)).toEqual(['LEVIATHAN', 'GUARDIAN', 'SPARTAN', 'DRAUPNIR', 'VALHALLA']);
  });
});

describe('saving a choice', () => {
  it('is one swap for the whole week; undo brings back the week before it', async () => {
    const d = new RagnarokDB(`choice-${Math.random()}`);
    useDatabase(d);
    await saveProfile(profile());
    await put('plan', { id: 'tue', kind: 'swap', date: TUE, weekStart: MON, map: { ...TUESDAY_SWAP }, reason: 'Missed BLADES' });
    await put('days', { id: TUE, sessionDone: true, sessionCode: 'BLADES' });
    let data = await loadData();
    await chooseSession(THU, weekWith(THU, data, 'LEVIATHAN', PLAN_START)!);
    data = await loadData();
    expect(scheduledCode(THU, data)).toBe('LEVIATHAN');
    expect(scheduledCode('2026-11-06', data)).toBe('SPARTAN');
    expect(scheduledCode(TUE, data)).toBe('BLADES');
    await undoWeekChange(MON);
    data = await loadData();
    expect(scheduledCode(THU, data)).toBe('SPARTAN');
    d.close();
  });

  it('accepting the offer keeps the days already gone too', async () => {
    const d = new RagnarokDB(`offer-${Math.random()}`);
    useDatabase(d);
    await saveProfile(profile());
    await put('plan', { id: 'tue', kind: 'swap', date: TUE, weekStart: MON, map: { ...TUESDAY_SWAP }, reason: 'Missed BLADES' });
    await put('days', { id: TUE, sessionDone: true, sessionCode: 'BLADES' });
    await put('days', { id: THU, checkin: { sleepMin: 470, sleepScore: 84, energy: 4, stress: 2, backPain: 0, kneePain: 0 } });
    const offer = computeDay(THU, await loadData(), at(THU)).offer!;
    await applyAction({ kind: 'acceptSwap', offer }, THU);
    const data = await loadData();
    expect(scheduledCode(TUE, data)).toBe('BLADES');
    expect(scheduledCode(THU, data)).toBe('LEVIATHAN');
    d.close();
  });
});

describe('the goal keeps count of a moved session', () => {
  it('a session done on another day of its week is not a miss in the consistency count', async () => {
    const { guardian } = await import('../src/recovery/goal');
    const data = slidWeek();
    data.recovery = { settings: { enabled: true }, injuries: [], checkins: [], wellness: [], records: [] } as unknown as NonNullable<typeof data.recovery>;
    // Monday's BLADES was done on Tuesday: 1 of 1 so far this week, not 1 of 2.
    expect(guardian(WED, data).parts.consistency.reason).toMatch(/^1 of \d+ sessions/);
    const reason = guardian(WED, data).parts.consistency.reason;
    const planned = Number(reason.match(/of (\d+)/)![1]);
    setDay(data, TUE, { sessionDone: false });
    const without = Number(guardian(WED, data).parts.consistency.reason.match(/of (\d+)/)![1]);
    expect(planned).toBe(without - 1);
  });
});
