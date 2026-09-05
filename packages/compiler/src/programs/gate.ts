/**
 * The real {@link ProgramVerificationGate}: the compiler's five-step gate,
 * shaped the way the authoring loop wants to hold it.
 *
 * The authoring side (`@terrainist/agents`) never imports the compiler; the
 * gate contract lives in `@terrainist/spec`, and this adapter satisfies it
 * using the compiler's `verify.ts` implementation. `verify` is total by
 * construction — `verifyPrograms` reports failures as diagnostics and never
 * throws for a bad program.
 */

import type {
  AuthoredProgramRecord,
  LoamDiagnostic,
  ProgramDocContext,
  ProgramFreezeFields,
  ProgramSubmission,
  ProgramVerificationGate,
} from "@terrainist/spec/ir";

import { sourceHashOf } from "./hash.js";
import { verifyProgram, verifyPrograms } from "./verify.js";

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

    async freeze(
      program: ProgramSubmission,
      docContext: ProgramDocContext,
    ): Promise<ProgramFreezeFields> {
      const verification = await verifyProgram(program.id, toRecord(program), {
        worldSeed: toWorldSeed(docContext.worldSeed),
      });
      if (!verification.ok) {
        // Same contract as `outputHash`: the loop only asks after a clean
        // `verify`, so a failure here is nondeterminism, which E336 names.
        throw new Error(
          `program "${program.id}" failed re-verification while hashing output`,
        );
      }
      // The conformance step ran iff it produced a digest; a program thrown
      // out before step 6 leaves the hash empty and gets no verdict stamped.
      const judged = verification.conformHash.startsWith("b3:");
      return {
        outputHash: verification.outputHash,
        ...(judged
          ? { conforms: verification.conforms, conformHash: verification.conformHash }
          : {}),
      };
    },
  };
}
