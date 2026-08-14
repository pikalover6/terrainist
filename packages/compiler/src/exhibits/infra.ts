/**
 * The infra-entry **run exhibit** — `docs/INFRA-ENTRIES-v0.md` §3.7's
 * obligation, discharged: a linear entry is reviewed as *a run, not a cell*,
 * because every linear defect this project has found lived on a diagonal or a
 * grade.
 *
 * One plot, one `test_fence`, four reads in a single walk:
 *
 * - a **straight** segment, the control;
 * - a **diagonal** stretch, where a stepped course is most likely to break its
 *   own connectivity;
 * - a **right-angle corner**, where the sweep's cross-section turns;
 * - a **graded slope**, where the datum steps and footing grows — the band's
 *   east end climbs eight blocks;
 * - and a **carriageway crossing** the straight segment once, so the `open`
 *   entry's found gate is visible in the same shot.
 *
 * **Seam file.** `devworld.ts` calls {@link buildInfraRunExhibit} once, after
 * the context section: the run shapes its own ground, and only inside its own
 * band, so nothing above it moves.
 */

import { infraEntry, INFRA_TEST_ENTRY, nodeSeed } from "@terrainist/stdlib";

import type { PrismarineStack } from "../emit/prismarine.js";
import type { ColumnPlan } from "../terrain/columns.js";
import type { StructureBlock } from "../structures/buildings.js";
import {
  buildInfraEntries,
  type InfraPlacementView,
} from "../structures/infra-entry.js";
import type { CoursePoint } from "../structures/wall-course.js";

/** The run plot's extents, from its north-west origin. */
export const INFRA_RUN_WIDTH = 96;
export const INFRA_RUN_DEPTH = 48;

/** Where the slope band starts (east of this, ground climbs) and its rise. */
const SLOPE_FROM = 56;
const SLOPE_RISE_PER = 4;
const SLOPE_MAX = 8;

/** The carriageway's x, crossing the straight segment north-south. */
const ROAD_X = 20;

/** The run's ground height at `x`, relative to the base plane. */
function runRiseAt(x0: number, x: number): number {
  const past = x - (x0 + SLOPE_FROM);
  if (past <= 0) return 0;
  return Math.min(SLOPE_MAX, Math.floor(past / SLOPE_RISE_PER));
}

/** What one build of the run reports. */
export interface InfraRunExhibitResult {
  readonly blocks: readonly StructureBlock[];
  /** Course columns built / skipped, from the pass's own stats. */
  readonly stats: Readonly<Record<string, number>>;
  /** Gate openings found at the carriageway. */
  readonly openings: number;
}

/**
 * Shape the band, paint the crossing, and sweep one `test_fence` along a
 * course with all four reads.
 */
export function buildInfraRunExhibit(
  plan: ColumnPlan,
  stack: PrismarineStack,
  worldSeed: bigint,
  x0: number,
  z0: number,
  baseY: number,
): InfraRunExhibitResult {
  const { region } = plan;

  // --- the band's own ground: flat west, an eight-block climb east ---------
  for (let z = z0; z < z0 + INFRA_RUN_DEPTH; z++) {
    const j = z - region.z0;
    if (j < 0 || j >= region.depth) continue;
    for (let x = x0; x < x0 + INFRA_RUN_WIDTH; x++) {
      const i = x - region.x0;
      if (i < 0 || i >= region.width) continue;
      const idx = j * region.width + i;
      const y = baseY + runRiseAt(x0, x);
      plan.ground[idx] = y;
      plan.fluidTop[idx] = y;
    }
  }

  // --- the carriageway, crossing the straight segment once ----------------
  const roadColumns = new Set<string>();
  const pathState = stack.blockStateOf("dirt_path", {}) ?? 0;
  for (let z = z0 + 28; z < z0 + INFRA_RUN_DEPTH; z++) {
    const j = z - region.z0;
    if (j < 0 || j >= region.depth) continue;
    for (const x of [x0 + ROAD_X, x0 + ROAD_X + 1]) {
      const i = x - region.x0;
      if (i < 0 || i >= region.width) continue;
      roadColumns.add(`${x},${z}`);
      plan.surface[j * region.width + i] = pathState;
    }
  }

  // --- the course: straight, diagonal, corner, slope -----------------------
  // A(4,40)→B(40,40) straight (crossed by the road at x=20);
  // B→C(52,28) diagonal; C→D(52,10) right-angle corner; D→E(90,10) the climb.
  const corridor: readonly CoursePoint[] = [
    { x: x0 + 4, z: z0 + 40 },
    { x: x0 + 40, z: z0 + 40 },
    { x: x0 + 52, z: z0 + 28 },
    { x: x0 + 52, z: z0 + 10 },
    { x: x0 + 90, z: z0 + 10 },
  ];

  const view: InfraPlacementView = {
    bounds: { x0, z0, width: INFRA_RUN_WIDTH, depth: INFRA_RUN_DEPTH },
    extentOf: () => undefined,
    corridorOf: (id) => (id === "exhibit_run" ? corridor : undefined),
    maskOf: () => undefined,
    ground: (x, z) => {
      const i = x - region.x0;
      const j = z - region.z0;
      if (i < 0 || i >= region.width || j < 0 || j >= region.depth) return undefined;
      return plan.ground[j * region.width + i] as number;
    },
    onRoad: (x, z) => roadColumns.has(`${x},${z}`),
  };

  const def = infraEntry(INFRA_TEST_ENTRY);
  if (def === undefined) {
    // The registry always carries its own test entry; losing it is a build
    // defect, not a condition to paper over.
    throw new Error(`infra run exhibit: registry has no "${INFRA_TEST_ENTRY}"`);
  }

  const result = buildInfraEntries({
    plan,
    stack,
    jobs: [
      {
        nodePath: "dev.infra.exhibit_run",
        def,
        route: { form: "along", target: "exhibit_run", offset: 0, run: 200 },
        params: {},
        seed: nodeSeed(worldSeed, "dev.infra.exhibit_run", ""),
        gates: true,
      },
    ],
    view,
  });

  return {
    blocks: result.blocks,
    stats: result.stats,
    openings: result.entries.reduce((n, e) => n + e.openings, 0),
  };
}
