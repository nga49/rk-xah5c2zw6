// Extension points for later phases (wellness, prevention, travel). No imports of engine code, so any
// module can register here without creating an import cycle through the session builder.
import type { Insight } from '../engine/insights';
import type { Data } from '../engine/model';
import type { ISODate } from '../plan/types';
import type { RecordOf } from './model';
import type { Kit } from './tags';

/** Extra conditions for a date: fills off, a block, an easier day, the kit available. `active` makes the hook run. */
export interface ContextExtra {
  noFill?: string | null;
  block?: RecordOf<'recoveryBlock'> | null;
  ease?: string | null;
  kit?: Set<Kit> | null;
  kitLabel?: string | null;
  /** Rows that need missing kit are swapped or skipped (a gym profile); otherwise kit only limits what the module adds. */
  enforceKit?: boolean;
  active?: boolean;
}
export type ContextSource = (date: ISODate, data: Data) => ContextExtra;
/** Extra Today cards. `active` is true when injury or block constraints exist on the date. */
export type InsightSource = (date: ISODate, data: Data, active: boolean) => Insight[];

export const contextSources: ContextSource[] = [];
export const insightSources: InsightSource[] = [];

export function provideContext(fn: ContextSource): void {
  if (!contextSources.includes(fn)) contextSources.push(fn);
}
export function provideInsights(fn: InsightSource): void {
  if (!insightSources.includes(fn)) insightSources.push(fn);
}
