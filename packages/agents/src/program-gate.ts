/**
 * The seam between program **authoring** and program **verification**.
 *
 * Phase 3 splits along one line: this package decides *what* bespoke programs a
 * world wants and writes them; `packages/compiler/src/programs/` decides
 * whether a program is allowed to exist. The five-step gate of the ratified
 * contract (static lint → double run → structural connectivity → physics lint →
 * nonsense guard) lives on the compiler side, and the authoring loop reaches it
 * through exactly one injected interface: {@link ProgramVerificationGate}.
 *
 * The interface is deliberately tiny and diagnostic-shaped. Everything the
 * repair loop needs from the gate is "here are the problems, in the same
 * `LoamDiagnostic` records the compiler already produces" — the loop hands them
 * back to the model verbatim and never interprets them. That is what keeps the
 * two tracks independently buildable: a stub gate ({@link stubProgramGate})
 * satisfies the authoring tests today, and the real gate drops in unchanged.
 */

import type { LoamDiagnostic } from "@terrainist/spec";

/** A program submitted for verification — source text plus how it is invoked. */
export interface ProgramSubmission {
  /** The document-level `programs` map key, e.g. `"ufo_lander"`. */
  readonly id: string;
  /** How the document is allowed to invoke it. */
  readonly mode: ProgramMode;
  /** Node-local `[w, h, d]` the program declares it needs. */
  readonly envelope: readonly [number, number, number];
  /** The program text. ≤ 64 KiB per the contract. */
  readonly source: string;
}

/** How a document may invoke a program. */
export type ProgramMode = "landmark" | "plugin" | "both";

/** The world facts a gate needs to run a program the way the compile will. */
export interface ProgramDocContext {
  /** The document's world seed — the per-instance seeds derive from it. */
  readonly worldSeed: number | string;
  /** Region edge length in blocks; the budget rule reads it too. */
  readonly size: number;
  /** The world prompt, for diagnostics a human will read. */
  readonly prompt?: string;
}

/**
 * The verification gate, as the authoring loop sees it.
 *
 * `verify` is total: it never throws for a bad program, it *reports* one. An
 * empty array means the submission passed every step of the contract's gate.
 */
export interface ProgramVerificationGate {
  verify(
    programs: readonly ProgramSubmission[],
    docContext: ProgramDocContext,
  ): Promise<readonly LoamDiagnostic[]>;
  /**
   * Canonical op-stream hash for a program that has already passed `verify`.
   *
   * Optional because it is meaningless for a stub: a gate that cannot execute
   * a program cannot hash its output, and the authoring loop records
   * `outputHash: undefined` rather than inventing one. The real gate always
   * implements it, and Phase 3's acceptance — recompiling a frozen document
   * byte-identically — needs it to.
   */
  outputHash?(
    program: ProgramSubmission,
    docContext: ProgramDocContext,
  ): Promise<string>;
}

/** Options for {@link stubProgramGate}. */
export interface StubGateOptions {
  /**
   * Diagnostics returned by the i-th `verify` call; the last entry repeats.
   * `[]` means "passes". Default: always passes.
   */
  readonly rounds?: readonly (readonly LoamDiagnostic[])[];
  /** Hash handed back by `outputHash`. Omit to leave the method undefined. */
  readonly outputHash?: string;
}

/**
 * A gate stub for tests and for running the authoring side before the compiler
 * side lands. It verifies nothing; it replays a script.
 */
export function stubProgramGate(options: StubGateOptions = {}): ProgramVerificationGate & {
  /** Every submission the loop sent, in order. */
  readonly calls: ProgramSubmission[][];
} {
  const rounds = options.rounds ?? [[]];
  const calls: ProgramSubmission[][] = [];
  const gate: ProgramVerificationGate & { calls: ProgramSubmission[][] } = {
    calls,
    async verify(programs) {
      const index = Math.min(calls.length, rounds.length - 1);
      calls.push([...programs]);
      return rounds[index] ?? [];
    },
  };
  if (options.outputHash !== undefined) {
    const hash = options.outputHash;
    gate.outputHash = async (): Promise<string> => hash;
  }
  return gate;
}
