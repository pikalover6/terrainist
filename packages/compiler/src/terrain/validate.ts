/**
 * Post-materialization validators.
 *
 * Two checks stand between the column plan and the emitter:
 *
 * 1. **fluid settling** — one simulated spread tick. A fluid block is unstable
 *    if it could flow: any horizontal neighbour, or the block below, is air
 *    within the world. Zero unstable blocks is required (`LOAM-T110`);
 *    `--allow-unstable` downgrades the failure to a warning.
 * 2. **floating vegetation** — every trunk base must rest on a solid, dry
 *    column (`LOAM-T111`).
 *
 * Both read the column plan rather than a voxel grid, which makes them exact
 * *and* linear in the number of columns: a column is solid up to `ground`,
 * fluid up to `fluidTop`, and air above, so "the lowest air face a neighbour
 * offers" is just `max(ground, fluidTop)`.
 */

import { type LoamDiagnostic, error, warning } from "@terrainist/spec";

import type { CaveIntegrityReport } from "./caves.js";
import type { ColumnPlan } from "./columns.js";
import { FluidKind } from "./columns.js";
import type { TreePlacement } from "./vegetation.js";

/** One unstable fluid block, for the diagnostic message. */
export interface UnstableFluid {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly kind: "water" | "lava";
}

/** Fluid-stability findings. */
export interface FluidStabilityReport {
  /** Total unstable fluid blocks across the world. */
  readonly unstable: number;
  /** Up to a handful of concrete examples, in row-major order. */
  readonly samples: readonly UnstableFluid[];
}

/** How many example positions a stability report carries. */
export const MAX_FLUID_SAMPLES = 8;

/**
 * Run the one-tick spread simulation over the column plan.
 *
 * For a fluid column whose surface is `fluidTop`, the blocks that could flow
 * are exactly those above the lowest neighbouring surface: if a neighbour's
 * combined solid+fluid top is `m`, every fluid block at `y > m` has an exposed
 * horizontal face. Region-boundary neighbours are outside the world and are
 * therefore not "air within the world" — they do not destabilize anything.
 */
export function checkFluidStability(plan: ColumnPlan): FluidStabilityReport {
  const { region, ground, fluidTop, fluidKind } = plan;
  const samples: UnstableFluid[] = [];
  let unstable = 0;

  for (let j = 0; j < region.depth; j++) {
    for (let i = 0; i < region.width; i++) {
      const idx = j * region.width + i;
      if (fluidKind[idx] === FluidKind.NONE) continue;
      const top = fluidTop[idx] as number;
      const floor = ground[idx] as number;
      if (top <= floor) continue;

      let lowest = Number.POSITIVE_INFINITY;
      if (i > 0) lowest = Math.min(lowest, surfaceOf(idx - 1));
      if (i < region.width - 1) lowest = Math.min(lowest, surfaceOf(idx + 1));
      if (j > 0) lowest = Math.min(lowest, surfaceOf(idx - region.width));
      if (j < region.depth - 1) lowest = Math.min(lowest, surfaceOf(idx + region.width));
      if (!Number.isFinite(lowest)) continue;

      const exposedFrom = Math.max(lowest, floor);
      if (top <= exposedFrom) continue;
      const count = top - exposedFrom;
      unstable += count;
      if (samples.length < MAX_FLUID_SAMPLES) {
        samples.push({
          x: region.x0 + i,
          y: top,
          z: region.z0 + j,
          kind: fluidKind[idx] === FluidKind.LAVA ? "lava" : "water",
        });
      }
    }
  }

  return { unstable, samples };

  function surfaceOf(idx: number): number {
    const g = ground[idx] as number;
    const f = fluidTop[idx] as number;
    return f > g ? f : g;
  }
}

/** Trees whose trunk base does not rest on solid, dry ground. */
export function checkFloatingVegetation(
  plan: ColumnPlan,
  trees: readonly TreePlacement[],
): TreePlacement[] {
  const { region, ground, fluidKind } = plan;
  const floating: TreePlacement[] = [];
  for (const tree of trees) {
    const i = tree.x - region.x0;
    const j = tree.z - region.z0;
    if (i < 0 || j < 0 || i >= region.width || j >= region.depth) {
      floating.push(tree);
      continue;
    }
    const idx = j * region.width + i;
    if ((ground[idx] as number) !== tree.baseY - 1 || fluidKind[idx] !== FluidKind.NONE) {
      floating.push(tree);
    }
  }
  return floating;
}

/**
 * Turn the cave integrity report into profile diagnostics.
 *
 * Both are errors and neither has an author-facing fix, because neither can be
 * caused by anything an author wrote: the carve band makes both impossible by
 * construction, so a finding here is a compiler bug and the hint says so. The
 * alternative — a warning nobody reads — would let exactly the defect this
 * round exists to prevent ship quietly.
 */
export function caveDiagnostics(
  report: CaveIntegrityReport,
  nodePath: string,
): LoamDiagnostic[] {
  const out: LoamDiagnostic[] = [];
  const where = (): string =>
    report.samples.map((s) => `(${s.x}, ${s.y}, ${s.z}): ${s.detail}`).join("; ");

  if (report.fluidBreaches > 0) {
    out.push(
      error(
        "CAVE_FLUID_BREACH",
        nodePath,
        `${report.fluidBreaches} carved cave span${report.fluidBreaches === 1 ? "" : "s"} break the ` +
          `four-block shell around water or lava — e.g. ${where()}`,
        "this is a compiler defect, not a document one: cave.carver@0's carve band is supposed to make " +
          "it unreachable. Report it. Narrowing the node's \"yRange\" or lowering \"density\" may work " +
          "around it meanwhile.",
      ),
    );
  }
  if (report.surfaceBreaches > 0) {
    out.push(
      error(
        "CAVE_SURFACE_BREACH",
        nodePath,
        `${report.surfaceBreaches} carved cave span${report.surfaceBreaches === 1 ? "" : "s"} come ` +
          `within the roof margin of the surface away from a declared entrance — e.g. ${where()}`,
        "this is a compiler defect: interior caves must leave the heightmap alone, and only an " +
          '"entrances" mouth may open the surface. Report it; lowering the node\'s "yRange" upper ' +
          "bound may work around it meanwhile.",
      ),
    );
  }
  return out;
}

/** Turn both validator results into profile diagnostics. */
export function validatorDiagnostics(
  fluids: FluidStabilityReport,
  floating: readonly TreePlacement[],
  options: { readonly allowUnstable: boolean },
): LoamDiagnostic[] {
  const out: LoamDiagnostic[] = [];

  if (fluids.unstable > 0) {
    const where = fluids.samples
      .map((s) => `${s.kind} at (${s.x}, ${s.y}, ${s.z})`)
      .join("; ");
    const message =
      `${fluids.unstable} fluid block${fluids.unstable === 1 ? "" : "s"} would flow on the first ` +
      `tick — e.g. ${where}`;
    const fix =
      "raise the surrounding terrain or lower the fluid: for a carved inlet, deepen the carve so " +
      "the water surface stays at seaLevel; for a caldera, increase the volcano's height or " +
      "reduce calderaDepth so the rim fully encloses the lava. Pass --allow-unstable only to " +
      "inspect the result — the world will visibly drain in game.";
    out.push(
      options.allowUnstable
        ? warning("UNSTABLE_FLUID", "", message, fix)
        : error("UNSTABLE_FLUID", "", message, fix),
    );
  }

  if (floating.length > 0) {
    const sample = floating[0] as TreePlacement;
    out.push(
      error(
        "FLOATING_VEGETATION",
        sample.nodeId,
        `${floating.length} tree${floating.length === 1 ? "" : "s"} would float — e.g. "${sample.speciesId}" ` +
          `at (${sample.x}, ${sample.baseY}, ${sample.z}) has no solid, dry block beneath it`,
        'tighten the forest node: lower "maxSlope", raise the lower bound of "elevation" above sea ' +
          "level, or move its \"area\" onto land",
      ),
    );
  }

  return out;
}
