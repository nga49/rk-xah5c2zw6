// The one seam into the session builder. Pure: it reads only its input and never mutates it.
import type { BuildInput, SessionPlan } from '../engine/session';

export type Core = (input: BuildInput) => SessionPlan;

/** Takes a build input and the original builder, returns the adjusted session. */
export function recoveryHook(input: BuildInput, core: Core): SessionPlan {
  return core(input);
}
