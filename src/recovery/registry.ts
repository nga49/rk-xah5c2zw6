// Extension points for later phases (wellness, prevention, travel). No imports of engine code, so any
// module can register here without creating an import cycle through the session builder.
import type { Insight } from '../engine/insights';
import type { Data } from '../engine/model';
import type { ISODate } from '../plan/types';
import type { RecordOf } from './model';

/** Extra conditions for a date: fills off (with the reason), or a block to apply. */
export type ContextSource = (date: ISODate, data: Data) => { noFill?: string | null; block?: RecordOf<'recoveryBlock'> | null };
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
