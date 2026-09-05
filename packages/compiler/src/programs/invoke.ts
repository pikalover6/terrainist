/**
 * The two invocation modes, on top of one instance runner.
 *
 * **Landmark** — invoked once, against the envelope the program declared. The
 * solver has already placed it like any other structure, with a pad; all this
 * file does is run it and hand back the voxels and the anchors.
 *
 * **Plugin** — invoked N times through `scatter.program@0`, one instance per
 * site the placer resolved, each with its own seed and each confined to its
 * own site's envelope. A failed instance is dropped whole; **more than a
 * quarter of them failing drops the node**, because one bad instance is bad
 * luck and a quarter of them is a bad program.
 *
 * Instances are ordered by placement order — never by completion order — so
 * `index` is a property of the geometry and not of the scheduler.
 */

import {
  PROGRAM_LIMITS,
  type AuthoredProgramRecord,
  type LoamDiagnostic,
  type ProgramTheme,
} from "@terrainist/spec/ir";
import { error, warning } from "@terrainist/spec";

import { runProgramInstance, type HeightSampler, type ProgramRun } from "./run.js";

/** Everything a landmark invocation reads. */
export interface LandmarkInvocation {
  readonly programId: string;
  readonly program: AuthoredProgramRecord;
  readonly nodePath: string;
  readonly worldSeed: bigint;
  readonly seedSalt?: string;
  readonly heightAt?: HeightSampler;
  /** The world's theme, as `api.theme`. Pinned when absent — see `theme.ts`. */
  readonly theme?: ProgramTheme;
}

/** Run a landmark program once. */
export function invokeLandmark(input: LandmarkInvocation): ProgramRun {
  return runProgramInstance({
    programId: input.programId,
    program: input.program,
    nodePath: input.nodePath,
    worldSeed: input.worldSeed,
    index: 0,
    count: 1,
    ...(input.seedSalt === undefined ? {} : { seedSalt: input.seedSalt }),
    ...(input.heightAt === undefined ? {} : { heightAt: input.heightAt }),
    ...(input.theme === undefined ? {} : { theme: input.theme }),
  });
}

/** Everything a plugin invocation reads. */
export interface PluginInvocation {
  readonly programId: string;
  readonly program: AuthoredProgramRecord;
  readonly nodePath: string;
  readonly worldSeed: bigint;
  readonly seedSalt?: string;
  /** One entry per resolved site, in placement order. */
  readonly count: number;
  /** Node-local ground sampler for instance `index`. */
  readonly heightAtFor?: (index: number) => HeightSampler;
  /** Fuel left for this node across all its instances. */
  readonly documentFuelRemaining?: number;
  /** The world's theme, as `api.theme`. One theme for every instance. */
  readonly theme?: ProgramTheme;
}

/** What a plugin invocation produced. */
export interface PluginInvocationResult {
  /** `true` when the node stands; `false` when the quarter rule dropped it. */
  readonly ok: boolean;
  /** Successful instances only, in placement order. */
  readonly runs: readonly ProgramRun[];
  readonly failed: number;
  readonly fuelUsed: number;
  readonly diagnostics: readonly LoamDiagnostic[];
}

/** Run a plugin program at every site, applying the quarter rule. */
export function invokePlugin(input: PluginInvocation): PluginInvocationResult {
  const runs: ProgramRun[] = [];
  const diagnostics: LoamDiagnostic[] = [];
  let failed = 0;
  let fuelUsed = 0;
  let budget = input.documentFuelRemaining ?? PROGRAM_LIMITS.maxDocumentFuel;

  for (let index = 0; index < input.count; index++) {
    const perInstance = Math.min(PROGRAM_LIMITS.maxInstanceFuel, Math.max(0, budget));
    const run = runProgramInstance({
      programId: input.programId,
      program: input.program,
      nodePath: input.nodePath,
      worldSeed: input.worldSeed,
      index,
      count: input.count,
      fuelBudget: perInstance,
      ...(input.seedSalt === undefined ? {} : { seedSalt: input.seedSalt }),
      ...(input.heightAtFor === undefined ? {} : { heightAt: input.heightAtFor(index) }),
      ...(input.theme === undefined ? {} : { theme: input.theme }),
    });
    fuelUsed += run.fuelUsed;
    budget -= run.fuelUsed;
    diagnostics.push(...run.diagnostics);
    if (run.ok) runs.push(run);
    else failed++;
  }

  if (input.count > 0 && failed > input.count * PROGRAM_LIMITS.maxInstanceFailureFraction) {
    diagnostics.push(
      error(
        "PROGRAM_GATE_FAILED",
        input.nodePath,
        `${failed} of ${input.count} instances of ${JSON.stringify(input.programId)} failed — over the ${PROGRAM_LIMITS.maxInstanceFailureFraction * 100}% the node tolerates`,
        "one bad instance is bad luck and a quarter of them is a bad program: fix the program (its seeding, its bounds, its budget) rather than reducing the count",
      ),
    );
    diagnostics.push(
      warning(
        "PROGRAM_DROPPED",
        input.nodePath,
        `program ${JSON.stringify(input.programId)} was dropped and this node falls back`,
        "the node builds nothing rather than a field of half-built instances; give it a `fallback` archetype if it must stand for something",
      ),
    );
    return { ok: false, runs: [], failed, fuelUsed, diagnostics };
  }
  if (failed > 0) {
    diagnostics.push(
      warning(
        "PROGRAM_DROPPED",
        input.nodePath,
        `${failed} of ${input.count} instances of ${JSON.stringify(input.programId)} were dropped whole`,
        "each dropped instance leaves its site empty rather than half-built; the diagnostics above say why each one failed",
      ),
    );
  }
  return { ok: true, runs, failed, fuelUsed, diagnostics };
}
