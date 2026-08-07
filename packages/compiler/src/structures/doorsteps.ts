/**
 * Doorsteps — reconciling a building's floor plane with the ground outside it.
 *
 * A building's floor is level; the ground it stands on is not, and the road
 * pass now cuts its lanes *into* that ground rather than laying them on top of
 * it ({@link ROAD_FILL_BAND}). Both are right, and together they leave a seam:
 * the path outside a door can end up a block below the threshold, and a
 * one-block rise in Minecraft is a jump, not a step. A world walkthrough
 * reported precisely that — you had to hop into half the houses in the village.
 *
 * This pass closes the seam per door, in the only two ways that read as
 * architecture:
 *
 * - **A stone-brick step.** When the ground outside is below the floor, a
 *   staircase of `@road.step` stairs runs out from the threshold, one stair per
 *   block of fall, each underpinned to the ground it stands on. A stair block
 *   is half a block at its front and a full block at its back, so every rise in
 *   the flight is half a block and none of it needs a jump.
 * - **Dropping the doorstep column.** When the ground outside is *above* the
 *   floor — a lane cut across a rise, arriving at a house sunk into it — there
 *   is nothing to build on, so the columns in front of the door are lowered
 *   into a graded landing instead.
 *
 * Both write through the column plan where they change the ground and as
 * structure blocks where they add masonry, which is the same split the road
 * pass uses: the ground is terrain, the stairs are not.
 */

import type { ResolvedPort } from "../layout/types.js";
import type { ColumnPlan } from "../terrain/columns.js";
import type { GroundClaim } from "../layout/ground-contract.js";
import { driverForPlan, type GroundDriver } from "../layout/ground-driver.js";
import { FluidKind } from "../terrain/columns.js";
import type { Palette } from "../terrain/palette.js";
import type { PrismarineStack } from "../emit/prismarine.js";

import type { BuiltBuilding, StructureBlock } from "./buildings.js";
import { index, inside } from "./roads.js";

/** How many columns out from a threshold a doorstep flight may reach. */
export const DOORSTEP_REACH = 6;

/** Input to {@link buildDoorsteps}. */
export interface DoorstepInput {
  readonly buildings: readonly BuiltBuilding[];
  readonly ports: readonly ResolvedPort[];
  /** Mutated: the surface and soil of a landing, and nothing else. */
  readonly plan: ColumnPlan;
  /**
   * The ground contract's driver (`docs/GROUND-CONTRACT-v0.md` §9a).
   *
   * Every landing this pass cuts goes through `commit`; nothing here writes
   * `plan.ground`. Omitted only by callers that are not the pipeline — the unit
   * tests that step a door on a bare plan — which then get a driver of their own
   * over the plan as it stands (`driverForPlan`).
   */
  readonly ground?: GroundDriver;
  readonly palette: Palette;
  readonly stack: PrismarineStack;
}

/** What the doorstep pass produced. */
export interface DoorstepResult {
  readonly blocks: readonly StructureBlock[];
  /** Doors that needed a flight of steps built out from them. */
  readonly stepped: number;
  /** Doors whose approach was cut down to meet the threshold. */
  readonly dropped: number;
  /** Doors that were already flush. */
  readonly flush: number;
  /**
   * 1 on every column this pass rewrote or built on, row-major over the plan
   * region — the ground in front of a door, which no later ground treatment
   * may repaint.
   */
  readonly touched: Uint8Array;
  /**
   * What this pass declared under the ground contract
   * (`docs/GROUND-CONTRACT-v0.md` §3.11b): one entry per door whose approach was
   * **cut**, naming only the `dropped` columns and their targets — the intents
   * it handed to the driver, kept as a return value for the report and the
   * tests. The `stepped` outcome contributes nothing: it is block placement
   * above a ground it does not move.
   */
  readonly declarations: readonly DoorstepDeclaration[];
}

/** One door's landing, as §3.11b declares it. */
export interface DoorstepDeclaration {
  /** `<nodePath>#doorstep@<port ref>` — unique per claim, as §4.1 requires. */
  readonly source: string;
  readonly columns: readonly GroundClaim[];
}

/** The four cardinals, as `(dx, dz)` and the block-state name of each. */
const FACINGS: readonly (readonly [number, number, string])[] = Object.freeze([
  [0, -1, "north"],
  [0, 1, "south"],
  [1, 0, "east"],
  [-1, 0, "west"],
] as const);

/** Build every doorstep. */
export function buildDoorsteps(input: DoorstepInput): DoorstepResult {
  const { plan, palette, stack } = input;
  const { region } = plan;
  // §9a.4: the one legal read. During the mixture the view is the plan at this
  // pass's own position — which, this pass running last, is every other pass's
  // finished work — so a door still measures the ground it actually meets.
  const driver = input.ground ?? driverForPlan(plan);
  const view = driver.view();
  const blocks: StructureBlock[] = [];
  let stepped = 0;
  let dropped = 0;
  let flush = 0;
  const touched = new Uint8Array(region.width * region.depth);
  const declarations: DoorstepDeclaration[] = [];

  const stepState = palette.has("road.step")
    ? palette.state("road.step")
    : (stack.blockByName("stone_bricks")?.stateId ?? 0);
  const stairFor = (facing: string): number =>
    stack.blockStateOf("stone_brick_stairs", {
      facing,
      half: "bottom",
      shape: "straight",
      waterlogged: "false",
    }) ?? stepState;

  const byPath = new Map(input.buildings.map((b) => [b.nodePath, b] as const));
  // Every building's footprint, so a flight never climbs into a neighbour.
  const claimed = (x: number, z: number): boolean =>
    input.buildings.some(
      (b) => x >= b.footprint.x0 && x <= b.footprint.x1 && z >= b.footprint.z0 && z <= b.footprint.z1,
    );

  for (const port of input.ports) {
    if (port.type !== "door") continue;
    const built = byPath.get(port.nodePath);
    if (built === undefined) continue;
    const [px, , pz] = port.position;
    const [nx, , nz] = port.outwardNormal;
    const dx = Math.sign(nx);
    const dz = Math.sign(nz);
    if (dx === 0 && dz === 0) continue;
    // The stairs ascend *towards* the threshold, so their raised half — which
    // is the half `facing` names — points back along the normal.
    const facing = (FACINGS.find((f) => f[0] === -dx && f[1] === -dz)?.[2] ?? "north") as string;
    const stair = stairFor(facing);

    // The interior floor block is at `floorY`; a player inside stands on top
    // of it, at `floorY + 1`. The approach has to arrive at that height.
    const floorY = built.floorY;
    let outcome: "flush" | "stepped" | "dropped" = "flush";
    let y = floorY;
    /** §3.11b: the cut columns of this door, and nothing else. */
    const cuts: GroundClaim[] = [];

    for (let k = 1; k <= DOORSTEP_REACH; k++) {
      const x = px + dx * k;
      const z = pz + dz * k;
      if (!inside(region, x, z) || claimed(x, z)) break;
      const idx = index(region, x, z);
      if (plan.fluidKind[idx] !== FluidKind.NONE) break;
      touched[idx] = 1;
      const g = view.ground[idx] as number;

      if (g >= y) {
        // The ground is at or above this step's line. If a flight is already
        // being built, it has met the hill and is finished. Otherwise the
        // approach stands *over* the threshold, and is cut down into a landing
        // that rises back to natural ground one block per column.
        if (outcome === "stepped" || g === y) break;
        const target = floorY + (k - 1);
        if (g <= target) break;
        // §9 step 2: the level goes to the driver, below, once this door's whole
        // approach is decided. What is left here is material, and it is laid on
        // the claimed columns whether or not the rank let the landing have them.
        cuts.push({ idx, y: target });
        outcome = "dropped";
        continue;
      }

      if (outcome === "dropped") break;
      // Underpin, then step. Filling to `y - 1` is what makes the stair a
      // stair rather than a slab hanging over a hole.
      for (let fill = g + 1; fill < y; fill++) {
        blocks.push({ x, y: fill, z, stateId: stepState });
      }
      blocks.push({ x, y, z, stateId: stair });
      outcome = "stepped";
      // A stair whose front lands within half a block of natural ground is the
      // last one the flight needs.
      if (y <= g + 1) break;
      y--;
    }

    if (outcome === "stepped") stepped++;
    else if (outcome === "dropped") dropped++;
    else flush++;
    if (cuts.length > 0) {
      // §3.11b — one `doorstep.landing` platform per cut approach, committed as
      // soon as this door's walk is finished so the next door reads the answer
      // rather than the request. That is inversion I3: a landing cut into a
      // column a street owns is a trench in the pavement at a threshold, and the
      // street keeps it; the door meets a flush threshold instead.
      const source = `${port.nodePath}#doorstep@${port.ref}`;
      declarations.push({ source, columns: cuts });
      driver.commit([
        {
          source,
          sourceClass: "doorstep.landing",
          kind: "platform",
          columns: cuts,
          transition: "step",
        },
      ]);
      // §9 step 2's second loop.
      for (const cut of cuts) {
        plan.surface[cut.idx] = stepState;
        if (plan.soil[cut.idx] === 0) plan.soil[cut.idx] = 1;
      }
    }
  }

  return { blocks, stepped, dropped, flush, touched, declarations };
}
