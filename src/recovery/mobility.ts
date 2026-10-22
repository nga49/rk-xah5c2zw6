// The daily mobility routine and the back reset follow the injury rules too: drills that load or stretch a
// protected area are listed to skip. HEURISTIC tags, like the exercise tags; walking stays "as tolerated".
import { BACK_RESET, MOBILITY_DAILY } from '../plan/content';
import type { MobilityRx } from '../engine/session';
import type { Ctx } from './constraints';
import type { Region } from './model';

export const DRILL_TAGS: Record<string, { regions: Region[]; regions2: Region[] }> = {
  'Cat-cow': { regions: ['lower-back', 'upper-back'], regions2: ['wrist-hand', 'knee'] },
  '90/90 hip switches': { regions: ['hip', 'glute'], regions2: ['adductor', 'groin', 'knee', 'lower-back'] },
  'Half-kneeling hip flexor stretch': { regions: ['hip', 'quad'], regions2: ['knee', 'groin', 'lower-back'] },
  'Thoracic open book': { regions: ['upper-back', 'shoulder'], regions2: ['neck', 'chest'] },
  'Knee-to-wall ankle rocks': { regions: ['ankle-foot', 'calf'], regions2: ['knee', 'shin'] },
  'Dead bug': { regions: ['abdomen'], regions2: ['hip', 'quad', 'lower-back'] },
  'Glute bridge': { regions: ['glute', 'hip'], regions2: ['hamstring', 'lower-back', 'quad'] },
  'Easy walk': { regions: [], regions2: ['ankle-foot', 'calf'] },
  'Bird dog': { regions: ['lower-back', 'abdomen'], regions2: ['glute', 'hip', 'hamstring', 'shoulder', 'knee', 'wrist-hand'] },
  'Side plank': { regions: ['abdomen'], regions2: ['shoulder', 'elbow', 'hip', 'adductor', 'lower-back'] },
  'Curl-up': { regions: ['abdomen'], regions2: ['neck'] },
  'Hip flexor stretch': { regions: ['hip', 'quad'], regions2: ['knee', 'groin'] },
};

/** Drills to skip today in the prescribed routine, with the area that rules them out. */
export function drillsToSkip(mobility: MobilityRx, ctx: Ctx): { names: string[]; why: string } | null {
  const drills = (mobility.routine === 'backReset' ? BACK_RESET : MOBILITY_DAILY).drills.map((d) => d.name);
  const out = new Set<string>();
  const why = new Set<string>();
  for (const a of ctx.areas) {
    for (const name of drills) {
      const t = DRILL_TAGS[name];
      // Walking as tolerated, except under a red flag.
      if (name === 'Easy walk' && a.level !== 'stop') continue;
      const primary = !t || t.regions.includes(a.region);
      const any = primary || t.regions2.includes(a.region);
      if ((a.level === 'stop' || a.level === 'protect') ? any : a.level === 'load' ? primary : false) {
        out.add(name);
        why.add(a.name);
      }
    }
  }
  return out.size ? { names: [...out], why: [...why].join(', ') } : null;
}

export const skipText = (s: { names: string[]; why: string }) => `Mobility: skip ${s.names.map((n) => n.toLowerCase()).join(', ')} (${s.why} protected).`;
