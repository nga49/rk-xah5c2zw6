// Ease of use: warning signs are only what you report and are easy to clear; the screens speak plainly.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { RagnarokDB, useDatabase } from '../src/db/db';
import { loadData } from '../src/db/store';
import { addDays } from '../src/engine/dates';
import { computeDay } from '../src/engine/today';
import { saveInjury, saveInjuryCheckin, saveSettings } from '../src/recovery/actions';
import { constraintsOn } from '../src/recovery/constraints';
import { markSeen, untickFlags } from '../src/recovery/flags';
import { flagsOf } from '../src/recovery/phases';
import { canTrain, changes, nextStep } from '../src/recovery/plain';
import { activeInjuries } from '../src/recovery/state';
import { morning } from './fixtures';
import { event, injCheckin, injury, moduleData } from './recovery-helpers';

const D = '2027-05-13';

describe('warning signs', () => {
  it('"Ticked by mistake" removes the tick from the log entry and the latest check-in', async () => {
    const d = new RagnarokDB(`flags-${Math.random()}`);
    useDatabase(d);
    await saveSettings({ enabled: true });
    const inj = await saveInjury({ region: 'calf', side: 'left', start: '2027-05-10', atLog: { flags: ['new-on-existing'] } });
    await saveInjuryCheckin({ injuryId: inj.id, date: D, painRest: 1, flags: ['numbness-spreading'] });
    let data = await loadData();
    expect(activeInjuries(D, data)[0].flags.length).toBeGreaterThan(0);
    await untickFlags(data.recovery!.injuries[0], D, data);
    data = await loadData();
    expect(activeInjuries(D, data)[0].flags).toEqual([]);
    expect(data.recovery!.checkins[0].painRest).toBe(1);
    d.close();
  });

  it('"I have been seen" clears every open flag, including pain rising over days', async () => {
    const d = new RagnarokDB(`seen-${Math.random()}`);
    useDatabase(d);
    await saveSettings({ enabled: true });
    const inj = await saveInjury({ region: 'calf', side: 'left', start: '2027-05-08' });
    for (let i = 0; i < 3; i++) await saveInjuryCheckin({ injuryId: inj.id, date: addDays('2027-05-10', i), painRest: i + 1 });
    let data = await loadData();
    expect(flagsOf(activeInjuries(D, data)[0])).toContain('pain-worse-over-days');
    await markSeen(inj, D);
    data = await loadData();
    expect(flagsOf(activeInjuries(D, data)[0])).toEqual([]);
    d.close();
  });
});

describe('plain words', () => {
  const inj = injury({ region: 'quad', side: 'right', start: '2027-05-11' });
  const data = moduleData({ injuries: [inj], records: [event(inj, '2027-05-11', { event: 'phase', phase: 'protect' })] });

  it('a leg day says you can train the upper body, and lists what changed', () => {
    const v = computeDay(D, data, morning(D));
    expect(canTrain(v, constraintsOn(D, data)).text).toMatch(/^Yes, you can train: SPARTAN, upper body only/);
    expect(changes(v).some((l) => l.startsWith('Paused: '))).toBe(true);
  });

  it('the next step says what it needs and how far along it is', () => {
    const withChecks = moduleData({ injuries: [inj], records: [event(inj, '2027-05-11', { event: 'phase', phase: 'protect' })], checkins: [injCheckin(inj, D, { painRest: 1, painWalk: 2 })] });
    const a = constraintsOn(D, withChecks)!.areas[0];
    const n = nextStep(a, D);
    expect(n.title).toBe('Next: Load phase');
    expect(n.needs[0].text).toMatch(/2 so far/);
    expect(n.needs[0].met).toBe(false);
    expect(n.needs[1].text).toMatch(/now 1 of 2/);
    expect(n.needs[1].met).toBe(false);
  });

  it('a stop-everything warning sign says training is paused', () => {
    const flagged = moduleData({ injuries: [{ ...inj, atLog: { flags: ['cannot-bear-weight'] } }] });
    const v = computeDay(D, flagged, morning(D));
    expect(canTrain(v, constraintsOn(D, flagged)).text).toMatch(/Training paused/);
  });
});
