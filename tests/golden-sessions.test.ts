// Golden fingerprint of the original engine: every day of the plan, three fixtures, plus every
// session type built directly. Written while src equalled main, so any later difference means the
// original behaviour changed. Regenerate only on purpose: GOLDEN_WRITE=1 npx vitest run tests/golden-sessions.test.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Data } from '../src/engine/model';
import { SESSION_TYPES } from '../src/engine/model';
import { getPosition } from '../src/engine/position';
import { buildSession, modsForType } from '../src/engine/session';
import { WEEKDAY_SESSIONS } from '../src/plan';
import type { SessionCode } from '../src/plan/types';
import { canonical, evening, historyData, neutralData, poundsData, sha, weekHashes } from './fixtures';

const FILE = new URL('./golden/sessions.json', import.meta.url);
const WRITE = process.env.GOLDEN_WRITE === '1';

export interface Golden {
  neutral: Record<string, string>;
  pounds: Record<string, string>;
  history: Record<string, string>;
  historyEvening: Record<string, string>;
  matrix: string;
}

/** buildSession for every code, both templates, every session type, both squat-equipment settings. */
export function matrixHash(make: () => Data): string {
  const parts: string[] = [];
  const dates = { S: '2026-11-03', H: '2027-02-02' };
  const codes = WEEKDAY_SESSIONS.filter((c): c is SessionCode => !!c);
  for (const [tpl, date] of Object.entries(dates)) {
    for (const gear of [false, true]) {
      const data = make();
      if (data.profile) data.profile = { ...data.profile, safetyBar: gear, beltSquat: gear };
      const pos = getPosition(date, data.plan);
      for (const code of codes) {
        for (const type of [...SESSION_TYPES, 'Rest' as const]) {
          parts.push(canonical({ tpl, gear, code, type, s: buildSession({ date, code, pos, mods: modsForType(type), data, backPain: type === 'Spine-sparing' ? 3 : 0 }) }));
        }
      }
    }
  }
  return sha(parts.join('\n'));
}

export function computeGolden(): Golden {
  const history = historyData();
  return {
    neutral: weekHashes(neutralData()),
    pounds: weekHashes(poundsData()),
    history: weekHashes(history),
    historyEvening: weekHashes(history, undefined, evening),
    matrix: matrixHash(neutralData),
  };
}

export function readGolden(): Golden {
  return JSON.parse(readFileSync(FILE, 'utf8')) as Golden;
}

/** Compare and name the first weeks that differ, for a readable failure. */
export function diffGolden(a: Golden, b: Golden): string[] {
  const out: string[] = [];
  for (const k of ['neutral', 'pounds', 'history', 'historyEvening'] as const) {
    const keys = new Set([...Object.keys(a[k]), ...Object.keys(b[k])]);
    for (const w of [...keys].sort()) if (a[k][w] !== b[k][w]) out.push(`${k} week ${w}`);
  }
  if (a.matrix !== b.matrix) out.push('session matrix');
  return out.slice(0, 12);
}

describe('golden: the original engine, fingerprinted', () => {
  it('every plan day and every session type match the fingerprint taken on main', () => {
    const now = computeGolden();
    if (WRITE) {
      mkdirSync(new URL('./golden/', import.meta.url), { recursive: true });
      writeFileSync(FILE, JSON.stringify(now, null, 1) + '\n');
    }
    expect(existsSync(FILE)).toBe(true);
    const want = readGolden();
    expect(diffGolden(now, want)).toEqual([]);
    expect(Object.keys(want.neutral).length).toBeGreaterThan(200);
  }, 300_000);
});
