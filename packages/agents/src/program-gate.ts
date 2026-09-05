/**
 * Hermetic test gate — the authoring side's stand-in for the real
 * {@link ProgramVerificationGate}.
 *
 * The contract lives in `@terrainist/spec`; this module provides only the
 * scripted stub the authoring tests use. It verifies nothing; it replays a
 * script.
 */

import type {
  LoamDiagnostic,
  ProgramFreezeFields,
  ProgramSubmission,
  ProgramVerificationGate,
} from "@terrainist/spec/ir";

/** Options for {@link stubProgramGate}. */
export interface StubGateOptions {
  /**
   * Diagnostics returned by the i-th `verify` call; the last entry repeats.
   * `[]` means "passes". Default: always passes.
   */
  readonly rounds?: readonly (readonly LoamDiagnostic[])[];
  /** Hash handed back by `outputHash`. Omit to leave the method undefined. */
  readonly outputHash?: string;
  /**
   * Conformance verdict handed back by `freeze`. Omit to leave `freeze`
   * undefined — the stub then behaves exactly as it did before the step
   * existed, and a record frozen through it carries no verdict.
   */
  readonly conformance?: { readonly conforms: boolean; readonly conformHash: string };
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
  if (options.conformance !== undefined) {
    const { conforms, conformHash } = options.conformance;
    const outputHash = options.outputHash;
    gate.freeze = async (): Promise<ProgramFreezeFields> => ({
      ...(outputHash === undefined ? {} : { outputHash }),
      conforms,
      conformHash,
    });
  }
  return gate;
}
