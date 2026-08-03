/**
 * The fan-out registry — one place a dial becomes a knob.
 *
 * **The table in the Phase 0 contract is a registry, not a switch.** Two rules
 * make the layer no-regret, and both are load-bearing:
 *
 * 1. **The intent package never imports a subsystem.** A row is *owned* by the
 *    subsystem it drives, defined in a file beside that subsystem, and
 *    registered through the one seam file (`./seam.ts`) — exactly as the
 *    exhibit rows are. Nothing in this file knows what a roof form is.
 * 2. **Every row is total.** A row must answer for an intent that declares
 *    nothing, and the answer must be the value the code produces *today*. That
 *    is why {@link FanOutContext} carries `today`: the row is handed the value
 *    the subsystem was about to use, and returning it unchanged is both the
 *    default and the proof. `packages/compiler/test/intent-identity.test.ts`
 *    compiles a real example with the registry live and with it cleared and
 *    asserts the two worlds hash equal.
 *
 * A row that is **reserved** — the contract's word for "the knob is built later
 * by the feature that owns it" — is registered anyway, returns `ctx.today`, and
 * names the phase that will implement it. Registering it now is what makes the
 * table inspectable before it is complete.
 */

import type { SemanticIntent } from "@terrainist/spec";

import type { ResolvedIntent } from "./resolve.js";

/** Whether a row drives a knob today, or is a placeholder for a later phase. */
export type FanOutStatus = "today" | "reserved";

/**
 * Everything a row is handed besides the intent.
 *
 * `today` is the value the calling subsystem would have used with no intent
 * layer at all. A row that has no opinion returns it, and the compile is
 * byte-identical.
 */
export interface FanOutContext<K> {
  readonly nodePath: string;
  readonly today: K;
  /** The node's seed, for a row that wants to vary rather than decide. */
  readonly seed?: bigint | number;
  /** Free extras a particular row's owner documents for itself. */
  readonly extra?: Readonly<Record<string, unknown>>;
}

/** One row of the fan-out table. */
export interface FanOutRow<K> {
  /** Dotted id, e.g. `"grammar.roofForm"`. Unique across the registry. */
  readonly id: string;
  /** Which dials the row reads. Documentation the report can print. */
  readonly reads: readonly (keyof SemanticIntent)[];
  readonly status: FanOutStatus;
  /** For a reserved row: the phase that will implement it. */
  readonly phase?: string;
  /** One line about what the row drives, for the registry dump. */
  readonly drives: string;
  /** **Total**: MUST answer for an intent that declares nothing. */
  resolve(intent: ResolvedIntent, ctx: FanOutContext<K>): K;
}

const REGISTRY = new Map<string, FanOutRow<never>>();

/** Register a row. Re-registering the same id replaces it (module reload). */
export function registerFanOut<K>(row: FanOutRow<K>): void {
  REGISTRY.set(row.id, row as unknown as FanOutRow<never>);
}

/**
 * Ask the table what a knob should be.
 *
 * Returns `today` when the row is not registered — a subsystem that asks for a
 * row nobody has written yet gets the behaviour it already had, which is the
 * only safe answer and keeps the seam from being load-bearing during a
 * refactor.
 */
export function fanOut<K>(id: string, intent: ResolvedIntent, ctx: FanOutContext<K>): K {
  const row = REGISTRY.get(id) as FanOutRow<K> | undefined;
  if (row === undefined) return ctx.today;
  return row.resolve(intent, ctx);
}

/** Every registered row, sorted by id. For the report and for the tests. */
export function fanOutRows(): readonly FanOutRow<never>[] {
  return [...REGISTRY.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** One registered row, or `undefined`. */
export function fanOutRow(id: string): FanOutRow<never> | undefined {
  return REGISTRY.get(id);
}

/**
 * Empty the registry.
 *
 * Test-only, and the byte-identity proof's mechanism: clearing every row makes
 * `fanOut` the identity function, so a compile with the registry cleared is a
 * compile with the intent layer taken out of the path.
 */
export function clearFanOut(): void {
  REGISTRY.clear();
}
