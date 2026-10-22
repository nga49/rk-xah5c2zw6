// Phase 1: the injury log and daily injury check-ins. Synthetic cases only.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { RagnarokDB, useDatabase } from '../src/db/db';
import { loadData } from '../src/db/store';
import { computeDay } from '../src/engine/today';
import { saveInjury, saveInjuryCheckin, saveSettings } from '../src/recovery/actions';
import { activeInjuries, injuryName, openFlags, statusOn } from '../src/recovery/state';
import { checkin } from './helpers';
import { morning } from './fixtures';
import { event, injCheckin, injury, moduleData } from './recovery-helpers';

const D = '2027-05-12';

describe('injury log: storage', () => {
  it('only region, side and start are required; the loader reports entries missing them', async () => {
    const d = new RagnarokDB(`log-${Math.random()}`);
    useDatabase(d);
    await saveSettings({ enabled: true });
    await saveInjury({ region: 'calf', side: 'right', start: '2027-05-10' });
    await d.injuries.put({ id: 'bad', updatedAt: 1 } as never);
    await saveInjuryCheckin({ injuryId: 'x', date: D, painRest: 14 });
    const data = await loadData();
    expect(data.recovery?.injuries.map((i) => i.region)).toEqual(['calf']);
    expect(data.recovery?.issues.length).toBe(1);
    expect(data.recovery?.checkins[0].painRest).toBe(10);
    d.close();
  });
});

describe('injury log: state on a date', () => {
  it('is active from its start date and stops once a cleared status is recorded', () => {
    const i = injury({ region: 'hamstring', side: 'left', start: '2027-05-10' });
    const data = moduleData({ injuries: [i], records: [event(i, '2027-06-01', { event: 'status', status: 'cleared' })] });
    expect(activeInjuries('2027-05-09', data)).toEqual([]);
    expect(activeInjuries(D, data).map((a) => a.injury.id)).toEqual([i.id]);
    expect(statusOn(i, '2027-06-02', data)).toBe('cleared');
    expect(activeInjuries('2027-06-02', data)).toEqual([]);
  });

  it('long-term limits are not episodes and never prompt a check-in', () => {
    const lim = injury({ region: 'forearm', side: 'both', start: '2026-01-01', kind: 'longTerm' });
    expect(activeInjuries(D, moduleData({ injuries: [lim] }))).toEqual([]);
  });

  it('red flags stay open until an assessment dated on or after them; only the latest check-in counts', () => {
    const i = injury({ region: 'calf', side: 'right', start: '2027-05-10', atLog: { flags: ['swelling-growing-fast'] } });
    const open = moduleData({ injuries: [i] });
    expect(openFlags(i, D, open)).toEqual(['swelling-growing-fast']);
    const seen = moduleData({ injuries: [i], records: [event(i, '2027-05-11', { event: 'assessed', by: 'clinician' })] });
    expect(openFlags(i, D, seen)).toEqual([]);
    const ticked = moduleData({ injuries: [i], records: [event(i, '2027-05-11', { event: 'assessed' })], checkins: [injCheckin(i, D, { flags: ['numbness-spreading'] })] });
    expect(openFlags(i, D, ticked)).toEqual(['numbness-spreading']);
    const unticked = moduleData({ injuries: [i], records: [event(i, '2027-05-11', { event: 'assessed' })], checkins: [injCheckin(i, D, { flags: ['numbness-spreading'] }), injCheckin(i, '2027-05-13', {})] });
    expect(openFlags(i, '2027-05-13', unticked)).toEqual([]);
  });

  it('names read naturally', () => {
    expect(injuryName(injury({ region: 'quad', side: 'left', start: D }))).toBe('Left quad');
    expect(injuryName(injury({ region: 'lower-back', side: 'midline', start: D }))).toBe('Lower back');
  });
});

describe('injury log: the daily check-in prompt', () => {
  it('appears right after the readiness check-in while an injury is active, and ticks itself once done', () => {
    const i = injury({ region: 'calf', side: 'right', start: '2027-05-10' });
    const data = moduleData({ injuries: [i] });
    const ids = computeDay(D, data, morning(D)).tasks.training.map((t) => t.id);
    expect(ids.indexOf(`rec:checkin:${i.id}`)).toBe(ids.indexOf('checkin') + 1);
    const done = moduleData({ injuries: [i], checkins: [injCheckin(i, D, { painRest: 2 })] });
    checkin(done, D);
    expect(computeDay(D, done, morning(D)).tasks.training.find((t) => t.id === `rec:checkin:${i.id}`)?.done).toBe(true);
  });

  it('can be switched off, and never appears without an active injury', () => {
    const i = injury({ region: 'calf', side: 'right', start: '2027-05-10' });
    const off = moduleData({ injuries: [i], settings: { id: 'settings', kind: 'settings', enabled: true, checkinPrompt: 'off', updatedAt: 1 } });
    expect(computeDay(D, off, morning(D)).tasks.training.some((t) => t.id.startsWith('rec:'))).toBe(false);
    expect(computeDay(D, moduleData(), morning(D)).tasks.training.some((t) => t.id.startsWith('rec:'))).toBe(false);
  });
});
