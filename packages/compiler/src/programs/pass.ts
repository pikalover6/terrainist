/**
 * The compiler pass that turns authored programs into blocks.
 *
 * Both invocation modes end here, and both end the same way: a run's node-local
 * voxels are resolved against the pinned block registry, offset to the site the
 * solver (landmark) or the placer (plugin) chose, and handed back as ordinary
 * {@link StructureBlock}s — so the structure pass, the emit and the physics
 * lint never learn that a model wrote this one.
 *
 * Order of business per node:
 *
 * 1. `sourceHash` (`E333`) — refuse a document whose source has been edited
 *    since the gate signed it.
 * 2. `outputHash` (`E334`) — re-execute the verification set and compare. Code
 *    is the canonical artifact; a stored expansion would be a cache only.
 * 3. Run the placed instances, confined to their envelopes, dropping any that
 *    fail whole, and applying the quarter rule to a plugin node.
 * 4. Lower to blocks and publish the anchors as §7.3 markers.
 */

import {
  type AuthoredProgramRecord,
  type LoamDiagnostic,
  type ProgramScatterParams,
} from "@terrainist/spec";
import { error } from "@terrainist/spec";
import { nodeSeed, type Marker } from "@terrainist/stdlib";

import type { Rect } from "../layout/frames.js";
import type { OccupancyGrid } from "../layout/types.js";
import type { StructureBlock } from "../structures/buildings.js";
import type { ColumnPlan } from "../terrain/columns.js";
import { parseBlockString } from "../emit/blockstring.js";
import type { PrismarineStack } from "../emit/prismarine.js";
import { invokeLandmark, invokePlugin } from "./invoke.js";
import { planProgramSites, type ProgramSite } from "./place.js";
import { checkSourceHash, type HeightSampler, type ProgramRun } from "./run.js";
import { verifyOutputHash } from "./verify.js";

/** Where a landmark program was placed by the solver. */
export interface ProgramPlacement {
  /** World footprint, inclusive; matches the program's declared `[w, d]`. */
  readonly footprint: Rect;
  /** World Y of the instance's node-local `y = 0`. */
  readonly baseY: number;
}

/** One authored-program node the compiler is asked to build. */
export interface ProgramJob {
  readonly nodePath: string;
  readonly programId: string;
  readonly program: AuthoredProgramRecord;
  readonly mode: "landmark" | "plugin";
  /** Landmark mode: the site the solver reserved. */
  readonly placement?: ProgramPlacement;
  /** Plugin mode: the `scatter.program@0` params. */
  readonly params?: ProgramScatterParams;
  readonly seedSalt?: string;
}

/** Everything {@link buildPrograms} reads. */
export interface ProgramPassInput {
  readonly jobs: readonly ProgramJob[];
  readonly plan: ColumnPlan;
  readonly stack: PrismarineStack;
  readonly worldSeed: bigint;
  readonly occupancy?: OccupancyGrid;
  /** Footprints already claimed by earlier passes. */
  readonly reserved?: readonly Rect[];
  /**
   * Skip the `E334` re-execution. Only for a caller that has already verified
   * this document in this process — never for a compile from a file.
   */
  readonly skipOutputHash?: boolean;
}

/** One instance that stands in the world. */
export interface PlacedProgram {
  readonly nodePath: string;
  readonly programId: string;
  readonly index: number;
  readonly footprint: Rect;
  readonly baseY: number;
  readonly blockCount: number;
  readonly seatY: number;
  readonly name: string;
}

/** What the pass produced. */
export interface ProgramPassResult {
  readonly blocks: readonly StructureBlock[];
  /** Anchors published as §7.3 markers, `"<nodePath>#<anchor>"`. */
  readonly markers: readonly Marker[];
  readonly placed: readonly PlacedProgram[];
  readonly diagnostics: readonly LoamDiagnostic[];
  /** Fuel spent across every instance of every job. */
  readonly fuelUsed: number;
}

/** Build every authored-program node, in document order. */
export function buildPrograms(input: ProgramPassInput): ProgramPassResult {
  const blocks: StructureBlock[] = [];
  const markers: Marker[] = [];
  const placed: PlacedProgram[] = [];
  const diagnostics: LoamDiagnostic[] = [];
  const claimed: Rect[] = [...(input.reserved ?? [])];
  let fuelUsed = 0;

  for (const job of input.jobs) {
    const hashProblem = checkSourceHash(job.programId, job.program, job.nodePath);
    if (hashProblem !== undefined) {
      diagnostics.push(hashProblem);
      continue;
    }
    if (input.skipOutputHash !== true) {
      const mismatch = verifyOutputHash(job.programId, job.program, input.worldSeed, job.nodePath);
      if (mismatch !== undefined) {
        diagnostics.push(mismatch);
        continue;
      }
    }

    const sites = resolveSites(job, input, claimed);
    if (sites.length === 0) {
      diagnostics.push(
        error(
          "PROGRAM_GATE_FAILED",
          job.nodePath,
          `no site would take ${JSON.stringify(job.programId)}`,
          "loosen the placement — a larger area, a smaller spacing, or a gentler maxSlope — or shrink the program's declared envelope",
        ),
      );
      continue;
    }

    const runs = executeSites(job, input, sites, diagnostics);
    fuelUsed += runs.fuelUsed;
    if (!runs.ok) continue;

    for (const [i, run] of runs.runs.entries()) {
      const site = sites[i] as ProgramSite;
      const lowered = lowerRun(run, site, input.stack, job, diagnostics);
      if (lowered === undefined) continue;
      claimed.push(site.footprint);
      blocks.push(...lowered.blocks);
      markers.push(...lowered.markers);
      placed.push(lowered.placed);
    }
  }

  return { blocks, markers, placed, diagnostics, fuelUsed };
}

function resolveSites(
  job: ProgramJob,
  input: ProgramPassInput,
  claimed: readonly Rect[],
): readonly ProgramSite[] {
  if (job.mode === "landmark") {
    if (job.placement === undefined) return [];
    return [{ index: 0, footprint: job.placement.footprint, baseY: job.placement.baseY }];
  }
  if (job.params === undefined) return [];
  return planProgramSites({
    params: job.params,
    envelope: job.program.envelope,
    plan: input.plan,
    seed: nodeSeed(input.worldSeed, job.nodePath, job.seedSalt ?? ""),
    taken: claimed,
    ...(input.occupancy === undefined ? {} : { occupancy: input.occupancy }),
  });
}

function executeSites(
  job: ProgramJob,
  input: ProgramPassInput,
  sites: readonly ProgramSite[],
  diagnostics: LoamDiagnostic[],
): { ok: boolean; runs: readonly ProgramRun[]; fuelUsed: number } {
  const sampler = (index: number): HeightSampler =>
    nodeLocalHeight(input.plan, sites[index] as ProgramSite);

  if (job.mode === "landmark") {
    const run = invokeLandmark({
      programId: job.programId,
      program: job.program,
      nodePath: job.nodePath,
      worldSeed: input.worldSeed,
      heightAt: sampler(0),
      ...(job.seedSalt === undefined ? {} : { seedSalt: job.seedSalt }),
    });
    diagnostics.push(...run.diagnostics);
    return { ok: run.ok, runs: run.ok ? [run] : [], fuelUsed: run.fuelUsed };
  }

  const result = invokePlugin({
    programId: job.programId,
    program: job.program,
    nodePath: job.nodePath,
    worldSeed: input.worldSeed,
    count: sites.length,
    heightAtFor: sampler,
    ...(job.seedSalt === undefined ? {} : { seedSalt: job.seedSalt }),
  });
  diagnostics.push(...result.diagnostics);
  return { ok: result.ok, runs: result.runs, fuelUsed: result.fuelUsed };
}

/** Node-local ground under one site: `heightAt(0, 0)` is the seating plane. */
export function nodeLocalHeight(plan: ColumnPlan, site: ProgramSite): HeightSampler {
  const { region } = plan;
  return (x: number, z: number): number => {
    const wx = site.footprint.x0 + x;
    const wz = site.footprint.z0 + z;
    const ix = wx - region.x0;
    const iz = wz - region.z0;
    if (ix < 0 || iz < 0 || ix >= region.width || iz >= region.depth) return 0;
    return (plan.ground[iz * region.width + ix] as number) - site.baseY;
  };
}

interface LoweredRun {
  readonly blocks: readonly StructureBlock[];
  readonly markers: readonly Marker[];
  readonly placed: PlacedProgram;
}

/**
 * Resolve one run's voxels against the registry and offset them to its site.
 *
 * A block the pinned registry does not know fails the **whole instance**: the
 * authoring gate already emitted this program through the same registry, so an
 * unresolvable block here means the document and this compiler disagree about
 * what Minecraft is, and half a landmark is not the answer to that.
 */
function lowerRun(
  run: ProgramRun,
  site: ProgramSite,
  stack: PrismarineStack,
  job: ProgramJob,
  diagnostics: LoamDiagnostic[],
): LoweredRun | undefined {
  const blocks: StructureBlock[] = [];
  // Sorted, so the block list is a pure function of the voxel set rather than
  // of the order the program happened to write them in.
  for (const key of [...run.voxels.keys()].sort(byColumnThenHeight)) {
    const [lx, ly, lz] = key.split(",").map(Number) as [number, number, number];
    const stateId = resolveBlock(stack, run.voxels.get(key) as string);
    if (stateId === undefined) {
      diagnostics.push(
        error(
          "PROGRAM_GATE_FAILED",
          job.nodePath,
          `instance ${run.index} of ${JSON.stringify(job.programId)} wrote ${JSON.stringify(run.voxels.get(key))}, which the pinned registry does not know`,
          "use full block strings the pinned registry knows, states included; the authoring gate checks this, so a failure here means the document was authored against a different Minecraft version",
        ),
      );
      return undefined;
    }
    blocks.push({
      x: site.footprint.x0 + lx,
      y: site.baseY + ly,
      z: site.footprint.z0 + lz,
      stateId,
    });
  }

  const markers: Marker[] = [];
  const anchors = run.result?.anchors ?? {};
  for (const name of Object.keys(anchors).sort()) {
    const [ax, ay, az] = anchors[name] as readonly [number, number, number];
    markers.push({
      id: `${job.nodePath}#${name}${job.mode === "plugin" ? `.${run.index}` : ""}`,
      name,
      x: site.footprint.x0 + ax,
      y: site.baseY + ay,
      z: site.footprint.z0 + az,
    });
  }

  return {
    blocks,
    markers,
    placed: {
      nodePath: job.nodePath,
      programId: job.programId,
      index: run.index,
      footprint: site.footprint,
      baseY: site.baseY,
      blockCount: blocks.length,
      seatY: run.result?.seatY ?? 0,
      name: run.result?.name ?? job.programId,
    },
  };
}

function byColumnThenHeight(a: string, b: string): number {
  const pa = a.split(",").map(Number);
  const pb = b.split(",").map(Number);
  return (pa[1] as number) - (pb[1] as number)
    || (pa[2] as number) - (pb[2] as number)
    || (pa[0] as number) - (pb[0] as number);
}

/** `"minecraft:oak_stairs[facing=north,half=top]"` → a state id. */
export function resolveBlock(stack: PrismarineStack, block: string): number | undefined {
  const parsed = parseBlockString(block);
  if (parsed === undefined) return undefined;
  return stack.blockStateOf(parsed.name, parsed.props);
}

export { parseBlockString };

