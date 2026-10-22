// Guards for the recovery module: it plugs in only at the listed seams, carries no personal markers, and
// every rule it uses names a source. Failures print file paths only, never the marker itself.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RETEST } from '../src/recovery/retest';
import { FATIGUE } from '../src/recovery/wellness';
import { SPIKE, WARMUP } from '../src/recovery/prevention';
import { PROTEIN, STEPS } from '../src/recovery/fuel';
import { RULES } from '../src/recovery/rules';

const root = new URL('..', import.meta.url).pathname;
const walk = (dir: string): string[] => readdirSync(join(root, dir)).flatMap((n) => {
  const rel = join(dir, n);
  return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel];
});

/** Original files allowed to know about the module: the seams named in the design. */
const SEAMS = ['src/engine/session.ts', 'src/engine/today.ts', 'src/engine/model.ts', 'src/db/store.ts', 'src/db/db.ts', 'src/App.tsx', 'src/main.tsx', 'src/screens/Settings.tsx', 'src/screens/Today.tsx', 'src/screens/Mind.tsx', 'src/screens/Train.tsx'];

describe('recovery module guards', () => {
  it('only the listed seams import the module', () => {
    const offenders = walk('src').filter((f) => /\.(ts|tsx)$/.test(f) && !f.startsWith('src/recovery/') && /from '[./]*\/?recovery\//.test(readFileSync(join(root, f), 'utf8')) && !SEAMS.includes(f));
    expect(offenders).toEqual([]);
  });

  it('module code and module tests carry none of the privacy markers', () => {
    const scan = readFileSync(join(root, 'scripts/privacy-scan.mjs'), 'utf8');
    const needles: string[] = JSON.parse((scan.match(/FORBIDDEN = (\[[^\]]*\])/)?.[1] ?? '[]').replace(/'/g, '"'));
    const local = join(root, 'tests/markers.local.json');
    if (existsSync(local)) needles.push(...(JSON.parse(readFileSync(local, 'utf8')) as string[]));
    expect(needles.length).toBeGreaterThan(0);
    const files = [...walk('src/recovery'), ...walk('tests').filter((f) => !f.includes('.local.') && /recovery|injury|wellness|goal|prevention|rehab|life-context|mind-body|exercise-tags|golden/.test(f)), 'e2e/recovery.spec.ts'];
    // Short markers are matched as whole words, so generated text like an identifier cannot trip them.
    const hit = (text: string, n: string) => (n.length <= 3 ? new RegExp(`(^|[^A-Za-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9]|$)`).test(text) : text.includes(n));
    const bad = files.filter((f) => needles.some((n) => hit(readFileSync(join(root, f), 'utf8'), n)));
    expect(bad).toEqual([]);
  });

  it('every rule names a source and an evidence level', () => {
    const all = { ...RULES, FATIGUE, WARMUP, SPIKE, RETEST, PROTEIN, STEPS } as Record<string, { source: string; evidence: string }>;
    for (const [k, r] of Object.entries(all)) {
      expect([k, r.source.length > 3]).toEqual([k, true]);
      expect(['partly', 'plan-rule', 'heuristic', 'unverified']).toContain(r.evidence);
    }
  });
});
