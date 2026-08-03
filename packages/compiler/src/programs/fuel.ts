/**
 * The fuel meter — the clock an authored program is allowed to have.
 *
 * §7.4 settles that fuel is the clock: wall time is nondeterministic, so a
 * program that runs out of *time* on one machine and not another turns the
 * compile into a coin flip. Fuel has to be a property of the program, not of
 * the host.
 *
 * ## The mechanism, and why this one
 *
 * We do not have a JS engine hook for instruction counting (that is what a
 * real isolate would buy us, and getting one is the recorded launch blocker in
 * `sandbox.ts`). What we have is the source text. So fuel is **charged by
 * source instrumentation**:
 *
 * - **1 unit on every block entry.** A `{` that opens a statement block —
 *   which is every loop body, every branch and every function body — gets a
 *   `__fuel()` call spliced in after it. A loop therefore costs one unit per
 *   iteration and a call costs one unit, so the meter bounds iteration and
 *   recursion, which are the only two ways a program runs forever.
 * - **API calls cost their real weight**: `set` 4 units, `heightAt` 2,
 *   `random` 2, `log` 32. These are the calls that cost the *compiler* work
 *   rather than the program, and charging them keeps a program that writes two
 *   hundred thousand blocks from being cheaper than the loop that computed
 *   where to put them.
 *
 * The instrumenter classifies a `{` by the significant character before it:
 * `)`, `;`, `{`, `}`, `>` (the tail of `=>`) or one of the keywords `do`,
 * `else`, `try`, `finally` opens a block; anything else (`=`, `(`, `,`, `:`,
 * `return`, an identifier) opens an object literal or a class body and is left
 * alone. The classification is conservative in the safe direction: a missed
 * insertion under-charges, and the static lint's brace requirement is what
 * stops the one shape — an unbraced loop body — where under-charging would be
 * unbounded.
 *
 * The whole thing is deterministic by construction: the same source instruments
 * to the same text and the same run charges the same units on every host.
 */

import { stripLiterals } from "@terrainist/spec";

/** What one API call costs. */
export const FUEL_COSTS = Object.freeze({
  blockEntry: 1,
  set: 4,
  heightAt: 2,
  random: 2,
  log: 32,
});

/** The name the instrumenter splices in. Not a legal identifier for authors. */
export const FUEL_HOOK = "__loam_fuel";

/** Thrown when an instance exhausts its budget. Caught at the instance boundary. */
export class FuelExhausted extends Error {
  constructor(readonly limit: number) {
    super(`program exhausted its fuel budget of ${limit} units`);
    this.name = "FuelExhausted";
  }
}

/** Thrown when an instance exceeds its write or heap cap. */
export class BudgetExceeded extends Error {
  constructor(
    readonly what: "writes" | "heap" | "logs",
    readonly limit: number,
  ) {
    super(`program exceeded its ${what} budget of ${limit}`);
    this.name = "BudgetExceeded";
  }
}

/** A monotone counter with a ceiling. */
export class FuelMeter {
  private used = 0;

  constructor(private readonly limit: number) {}

  /** Charge `n` units; throws {@link FuelExhausted} at the ceiling. */
  charge(n: number): void {
    this.used += n;
    if (this.used > this.limit) throw new FuelExhausted(this.limit);
  }

  get spent(): number {
    return this.used;
  }

  get remaining(): number {
    return Math.max(0, this.limit - this.used);
  }
}

const BLOCK_OPENERS = new Set([")", ";", "{", "}", ">"]);
const BLOCK_KEYWORDS = new Set(["do", "else", "try", "finally"]);

/**
 * Splice a fuel charge into every statement block of `source`.
 *
 * Offsets come from the literal-stripped mirror of the source (so a `{` inside
 * a string is not a block) and the splice is applied to the original text, so
 * line numbers in a stack trace still point at what the author wrote.
 */
export function instrumentFuel(source: string): string {
  const code = stripLiterals(source);
  const inserts: number[] = [];

  for (let i = 0; i < code.length; i++) {
    if (code[i] !== "{") continue;
    if (opensBlock(code, i)) inserts.push(i + 1);
  }

  if (inserts.length === 0) return source;
  const call = `${FUEL_HOOK}();`;
  let out = "";
  let last = 0;
  for (const at of inserts) {
    out += source.slice(last, at) + call;
    last = at;
  }
  return out + source.slice(last);
}

function opensBlock(code: string, brace: number): boolean {
  let i = brace - 1;
  while (i >= 0 && /\s/.test(code[i] as string)) i--;
  if (i < 0) return true;
  const c = code[i] as string;
  if (BLOCK_OPENERS.has(c)) return true;
  if (!/[\w$]/.test(c)) return false;
  let j = i;
  while (j >= 0 && /[\w$]/.test(code[j] as string)) j--;
  return BLOCK_KEYWORDS.has(code.slice(j + 1, i + 1));
}
