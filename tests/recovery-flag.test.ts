// With the module switched on but nothing logged, every plan day must still equal the original.
import { describe, expect, it } from 'vitest';
import type { Data } from '../src/engine/model';
import type { RecoveryData } from '../src/recovery/model';
import { evening, historyData, neutralData, poundsData, weekHashes } from './fixtures';
import { diffGolden, matrixHash, readGolden, type Golden } from './golden-sessions.test';

export function inert(): RecoveryData {
  return { settings: { id: 'settings', kind: 'settings', enabled: true, updatedAt: 1 }, injuries: [], checkins: [], wellness: [], records: [], issues: [] };
}

export const withModule = (d: Data, r: RecoveryData = inert()): Data => ({ ...d, recovery: r });

describe('module on, nothing active: identical to the original engine', () => {
  it('matches the golden fingerprint on every fixture', () => {
    const history = withModule(historyData());
    const now: Golden = {
      neutral: weekHashes(withModule(neutralData())),
      pounds: weekHashes(withModule(poundsData())),
      history: weekHashes(history),
      historyEvening: weekHashes(history, undefined, evening),
      matrix: matrixHash(() => withModule(neutralData())),
    };
    // The DayView must not even gain keys while nothing is active.
    expect(diffGolden(now, readGolden())).toEqual([]);
  }, 300_000);
});
