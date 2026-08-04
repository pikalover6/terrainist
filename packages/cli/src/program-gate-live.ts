/**
 * The real {@link ProgramVerificationGate}: the compiler's five-step gate,
 * shaped the way the authoring loop wants to hold it.
 *
 * The authoring side (packages/agents) deliberately never imports the
 * compiler; the CLI is the one place that holds both ends, so the adapter
 * lives here. `verify` is total by construction — `verifyPrograms` reports
 * failures as diagnostics and never throws for a bad program.
 */

import type {
  ProgramDocContext,
  ProgramSubmission,
  ProgramVerificationGate,
} from "@terrainist/agents";
import { sourceHashOf, verifyProgram, verifyPrograms } from "@terrainist/compiler";
import type { AuthoredProgramRecord, LoamDiagnostic } from "@terrainist/spec";

function toRecord(submission: ProgramSubmission): AuthoredProgramRecord {
  return {
    mode: submission.mode,
    envelope: submission.envelope,
    source: submission.source,
    sourceHash: sourceHashOf(submission.source),
    outputHash: "",
  };
}

function toWorldSeed(seed: number | string): bigint {
  return typeof seed === "number" ? BigInt(seed) : BigInt(seed);
}

/** The compiler-backed gate the generate flow injects into program authoring. */
export function compilerProgramGate(): ProgramVerificationGate {
  return {
    async verify(
      programs: readonly ProgramSubmission[],
      docContext: ProgramDocContext,
    ): Promise<readonly LoamDiagnostic[]> {
      const map: Record<string, AuthoredProgramRecord> = {};
      for (const p of programs) map[p.id] = toRecord(p);
      const verifications = await verifyPrograms(map, {
        worldSeed: toWorldSeed(docContext.worldSeed),
      });
      return verifications.flatMap((v) => v.diagnostics);
    },

    async outputHash(
      program: ProgramSubmission,
      docContext: ProgramDocContext,
    ): Promise<string> {
      const verification = await verifyProgram(program.id, toRecord(program), {
        worldSeed: toWorldSeed(docContext.worldSeed),
      });
      if (!verification.ok) {
        // The loop only asks after a clean `verify`; a failure here means the
        // program is nondeterministic across calls, which E336 already names.
        throw new Error(
          `program "${program.id}" failed re-verification while hashing output`,
        );
      }
      return verification.outputHash;
    },
  };
}
