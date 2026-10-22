// Runs the owner's own scenario from a git-ignored local file, if it exists. Nothing about it is committed:
// the file is data only (tests/*.local.json is ignored) and this runner checks generic invariants.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addDays } from '../src/engine/dates';
import { LOWER_BODY_SESSIONS } from '../src/plan';
import { computeDay } from '../src/engine/today';
import { weekVolume } from '../src/recovery/goal';
import type { Injury, WellnessCheckin } from '../src/recovery/model';
import { needsLoadingClearance } from '../src/recovery/phases';
import { activeInjuries } from '../src/recovery/state';
import { tagsFor } from '../src/recovery/tags';
import { YOKE } from '../src/recovery/volume';
import { fatigueOn } from '../src/recovery/wellness';
import { morning } from './fixtures';
import { makeData } from './helpers';
import { moduleData } from './recovery-helpers';

interface Local { date: string; tomorrow: string; nextMonday: string; injury: Omit<Injury, 'id' | 'updatedAt'>; wellness?: Omit<WellnessCheckin, 'id' | 'updatedAt'> }
const url = new URL('./injury.local.json', import.meta.url);
const fx: Local | null = existsSync(url) ? JSON.parse(readFileSync(url, 'utf8')) : null;

describe('local private fixture', () => {
  it.runIf(!!fx)('scenario from the local private fixture', () => {
    const f = fx as Local;
    const inj: Injury = { id: 'local', updatedAt: 1, ...f.injury };
    const data = moduleData({ injuries: [inj], wellness: f.wellness ? [{ id: `wc:${f.wellness.date}`, updatedAt: 1, ...f.wellness }] : [] }, makeData());
    for (let i = 0; i < 14; i++) {
      const d = addDays(f.date, i);
      const v = computeDay(d, data, morning(d));
      for (const e of v.session.exercises.filter((x) => !x.key.startsWith('REHAB:') && !x.key.startsWith('RX:'))) {
        const t = tagsFor(e.name);
        expect([d, e.name, !!t && ![...t.regions, ...t.regions2].includes(inj.region)]).toEqual([d, e.name, true]);
      }
      if (v.code && LOWER_BODY_SESSIONS.includes(v.code)) expect(v.decision.type).toBe('Upper only');
      expect(v.session.title).not.toBe('Paused');
    }
    const tomorrow = computeDay(f.tomorrow, data, morning(f.tomorrow));
    expect(tomorrow.session.exercises.length).toBeGreaterThan(3);
    const vol = weekVolume(f.nextMonday, data);
    for (const m of [...YOKE, 'Back', 'Biceps', 'Triceps'] as const) expect([m, vol.find((v) => v.muscle === m)?.status]).toEqual([m, 'met']);
    const a = activeInjuries(f.date, data)[0];
    expect(a.phase).toBe('protect');
    expect(needsLoadingClearance(a)).not.toBeNull();
    if (f.wellness) expect(fatigueOn(f.date, data).level).toBe('none');
  });
});
