/**
 * Worldgen agents: planner emits L3 + top-of-tree L2, implementers expand
 * nodes under a subdivision contract.
 *
 * Placeholder scaffold: the real agent loop lands in G3.
 */

import type { LoamDocument } from "@terrainist/spec";

/** What a parent hands a child agent when subdividing. Placeholder shape. */
export interface SubdivisionContract {
  nodePath: string;
}

/** Not implemented yet — prompt-to-Loam planning lands in G3. */
export function plan(_prompt: string): Promise<LoamDocument> {
  throw new Error("@terrainist/agents: plan() is not implemented yet");
}
