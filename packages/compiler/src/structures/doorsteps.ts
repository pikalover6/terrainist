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

import type { SeamLandings } from "../layout/district.js";
import { GROUND_V1_FREEZE, type ResolvedPort } from "../layout/types.js";
import type { ColumnPlan } from "../terrain/columns.js";
import type { GroundClaim, GroundIntent } from "../layout/ground-contract.js";
import { driverForPlan, type GroundDriver } from "../layout/ground-driver.js";
import { FluidKind } from "../terrain/columns.js";
import type { Palette } from "../terrain/palette.js";
import type { PrismarineStack } from "../emit/prismarine.js";

import type { BuiltBuilding, StructureBlock } from "./buildings.js";
import { index, inside } from "./roads.js";

/** How many columns out from a threshold a doorstep flight may reach. */
export const DOORSTEP_REACH = 6;

/**
 * How far a walkable neighbour of a flight's foot may stand from the foot's own
 * level, in blocks.
 *
 * One block is the whole of it: a one-block rise is a jump, and a flight whose
 * bottom stair has nothing within a jump of it beside it has not arrived
 * anywhere. Two or more is a bank face — the LOAM-W411 case, a terrace seam
 * refused its retaining wall and graded raw — and a flight laid up a bank face
 * is the "stairs to nowhere" a walkthrough reported: masonry decorating a wall.
 */
export const DOORSTEP_FOOT_STEP = 1;

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
  /**
   * **S10's first source of truth** (`docs/GROUND-UNIFICATION-v0.md` §4.1):
   * `RetainingPassResult.landings`, the treads of every tier stack and the top
   * and foot of every wall.
   *
   * A landing is a place a flight is *allowed* to arrive at, and it is the one
   * arrival {@link DOORSTEP_FOOT_STEP}'s two-column test cannot recognise on its
   * own: the far side of a tread is the next tier's face, so a foot on a
   * perfectly good terrace reads as the brink of a fall. S9 is what makes a
   * legal foot exist; this is how the gate knows one when it lands on it.
   *
   * Optional and absent on every world until `SEAM_TIERS` flips — with it
   * absent the gate is character-for-character the one the foot-gate wave
   * shipped.
   */
  readonly landings?: SeamLandings;
  /**
   * **S10's second source of truth**: `RetainingPassResult.bank`, 1 on every
   * column of graded bank, row-major over the plan region.
   *
   * S8 — *a bank is a landform, and a landform carries nothing*. A flight may
   * never terminate on one, whatever the heights say, and the heights do say it
   * is fine: a bank graded at `APRON_RUN_PER_BLOCK` steps half a block per
   * column, which passes both of {@link DOORSTEP_FOOT_STEP}'s tests all the way
   * up. That is the "stairs to nowhere" finding exactly — 46 flights up a bank
   * face on one deck — and it is why the mask is consulted rather than the
   * ground.
   */
  readonly bank?: Uint8Array;
  /**
   * **§6a.10 i, finished at G6: decide here, paint there.**
   *
   * Tier order (v1 §1.6) requires every declarer before every builder, and this
   * pass declares `doorstep.landing` — tier D. Under `GROUND_V1_FREEZE` it
   * therefore runs at pass 5b, at the end of the declaring half, where its read
   * (`view("D")`, tiers A–C) is exactly the read §1.4 entitles a tier-D
   * declarer to. What it must *not* do there is paint: `plan.surface` and
   * `plan.soil` are last-write-wins across the material passes, and moving a
   * write from 5e to 5b would let a later pass overwrite a threshold.
   *
   * So with this set the two material writes are collected into
   * {@link DoorstepResult.materials} instead of applied, and the building half
   * applies them at the pipeline position they have always occupied. The blocks
   * ride along the same way — they are a pure function of the walk, and the walk
   * is what moved.
   */
  readonly deferMaterials?: boolean;
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
   * Doors whose flight was proposed and then **refused**: its foot would have
   * landed on a bank face or in mid-bank air rather than on anything walkable
   * ({@link DOORSTEP_FOOT_STEP}). Nothing is written for these — the door keeps
   * a plain sill, and the physics lint is left free to report it as unreachable,
   * which it honestly is.
   */
  readonly refused: number;
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
  /**
   * The landing paint this walk decided on, held rather than applied when
   * {@link DoorstepInput.deferMaterials} is set — see there. Empty otherwise,
   * because the writes went straight into the plan.
   */
  readonly materials: readonly DoorstepMaterial[];
}

/** One landing column's paint, as {@link DoorstepInput.deferMaterials} holds it. */
export interface DoorstepMaterial {
  readonly idx: number;
  readonly surface: number;
}

/**
 * Apply what a deferred walk decided — the building half's half of §6a.10 i.
 *
 * The same two writes the loop makes inline, in the same order, at the pipeline
 * position the pass has always painted from.
 */
export function paintDoorsteps(plan: ColumnPlan, materials: readonly DoorstepMaterial[]): void {
  for (const m of materials) {
    plan.surface[m.idx] = m.surface;
    if (plan.soil[m.idx] === 0) plan.soil[m.idx] = 1;
  }
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
  const view = driver.view("D");
  const blocks: StructureBlock[] = [];
  let stepped = 0;
  let dropped = 0;
  let flush = 0;
  let refused = 0;
  const touched = new Uint8Array(region.width * region.depth);
  const declarations: DoorstepDeclaration[] = [];
  /** Tier D's claims, accumulated for one commit under the freeze (§6a.10 ii). */
  const tierClaims: GroundIntent[] = [];
  /** {@link DoorstepInput.deferMaterials}' sink; empty on the painting path. */
  const materials: DoorstepMaterial[] = [];

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

  /**
   * S10's landings, flattened to `column → the level it stands at`.
   *
   * Built once rather than searched per door: a quarter publishes one entry per
   * tread column and a door asks about two columns. Where two stacks published
   * one column — a tread that is also the platform its neighbour holds — the
   * **first** publication wins, which is the retaining pass's own row-major seam
   * order and therefore a fact about the ground rather than about the walk.
   */
  const landingY = new Map<number, number>();
  for (const stack of input.landings ?? []) {
    for (const landing of stack.landings) {
      for (const column of landing.columns) {
        if (!inside(region, column.x, column.z)) continue;
        const k = index(region, column.x, column.z);
        if (!landingY.has(k)) landingY.set(k, landing.y);
      }
    }
  }
  const bankMask = input.bank;

  const byPath = new Map(input.buildings.map((b) => [b.nodePath, b] as const));
  // Every building's footprint, so a flight never climbs into a neighbour.
  const claimed = (x: number, z: number): boolean =>
    input.buildings.some(
      (b) => x >= b.footprint.x0 && x <= b.footprint.x1 && z >= b.footprint.z0 && z <= b.footprint.z1,
    );

  /**
   * Does the bottom stair of a flight put a walker down on something walkable?
   *
   * The same shape of question `connects` asks of a set-piece stair and
   * `terminusLandings` asks of a street beside a flight: not "is there ground"
   * — a bank face is ground — but "is there ground you can *stand on and walk
   * off*". And it is asked **along the flight's own direction**, because that
   * is what a flight is: a way out of a door. A staircase that can only be left
   * by side-stepping off its bottom tread never needed to point where it points;
   * on a terrace seam refused its retaining wall (LOAM-W411) that is exactly
   * what it is — treads let into the raw graded face of the bank, going nowhere.
   *
   * Two columns settle it. The first is where a walker's foot lands coming off
   * the bottom stair, and it must be within {@link DOORSTEP_FOOT_STEP} of the
   * stair's own level. The second is one further on, and it must be within the
   * same step of the first — otherwise the landing is the brink of the face
   * rather than a way off it, which reads as a landing until you look past it.
   * Declared paving, a lot plane and genuinely flat ground all pass both:
   * all three are level where they meet the foot and level again beyond it.
   *
   * **S10 extends this and never rewrites it**
   * (`docs/GROUND-UNIFICATION-v0.md` §4.1). {@link DOORSTEP_FOOT_STEP} is still
   * the whole of the measurement; what the two masks add is the two answers the
   * measurement cannot reach on its own — a {@link DoorstepInput.bank} column is
   * never an arrival however gently it steps, and a
   * {@link DoorstepInput.landings} column always is, because a tread's far side
   * is the next face down by construction. Both absent is today's gate exactly.
   */
  const footLands = (
    foot: { readonly x: number; readonly z: number; readonly y: number } | null,
    dx: number,
    dz: number,
  ): boolean => {
    if (foot === null) return false;
    const nx = foot.x + dx;
    const nz = foot.z + dz;
    // Off the region, into a neighbour's wall, or into water: the flight has
    // arrived at *something*, and none of those are a bank face. An edge is not
    // a cliff and a wall is a place.
    if (!inside(region, nx, nz) || claimed(nx, nz)) return true;
    const n = index(region, nx, nz);
    if (view.fluidKind[n] !== FluidKind.NONE) return true;
    // **S8 and S10, and it comes before the heights on purpose.** A bank is a
    // landform and a landform carries nothing. A bank graded at 1:2 steps half a
    // block per column, so both of the tests below pass on it all the way up the
    // face — which is precisely how 46 flights came to be built up one, and why
    // the mask is the answer here rather than an argument about ground.
    if (bankMask !== undefined && bankMask[n] === 1) return false;
    const gn = view.ground[n] as number;
    // Step one: off the bottom stair onto the ground ahead of it.
    if (Math.abs(gn - foot.y) > DOORSTEP_FOOT_STEP) return false;
    // **S9 and S10: a landing is an arrival, and step two is not asked of it.**
    // The far side of a tread is the next tier's face by construction, so a foot
    // on a perfectly good terrace fails the brink test below — the one case
    // where "the last block before a fall" is a place a town put there for you
    // to stand on. A wall's top and foot are landings for the same reason.
    if (landingY.has(n) && Math.abs((landingY.get(n) as number) - foot.y) <= DOORSTEP_FOOT_STEP) {
      return true;
    }
    // Step two: that ground has to lead on rather than be the last block before
    // a fall — the brink of a terrace face reads exactly like a landing until
    // you look one column further.
    const mx = nx + dx;
    const mz = nz + dz;
    if (!inside(region, mx, mz) || claimed(mx, mz)) return true;
    const m = index(region, mx, mz);
    if (view.fluidKind[m] !== FluidKind.NONE) return true;
    if (bankMask !== undefined && bankMask[m] === 1) return false;
    return Math.abs((view.ground[m] as number) - gn) <= DOORSTEP_FOOT_STEP;
  };

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
    // A flight is *proposed* into these, not written: the masonry and the
    // columns it would claim are held back until the foot is known to land on
    // something walkable. A `dropped` approach cuts ground and is not held —
    // it is a landing graded to meet the sill, not a flight climbing away from
    // one, so it cannot dead-end.
    const flight: StructureBlock[] = [];
    const walked: number[] = [];
    /** The bottom stair of the proposed flight: where it puts a walker down. */
    let foot: { readonly x: number; readonly z: number; readonly y: number } | null = null;

    for (let k = 1; k <= DOORSTEP_REACH; k++) {
      const x = px + dx * k;
      const z = pz + dz * k;
      if (!inside(region, x, z) || claimed(x, z)) break;
      const idx = index(region, x, z);
      // The **view's** fluid, not the plan's: at pass 5b the plan still holds
      // the materialised baseline and `fluid.channel` is a tier-A claim the
      // prefix already answers. Off the freeze path the view *is* the plan's
      // three arrays, so this is the same read it has always been.
      if (view.fluidKind[idx] !== FluidKind.NONE) break;
      walked.push(idx);
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
        flight.push({ x, y: fill, z, stateId: stepState });
      }
      flight.push({ x, y, z, stateId: stair });
      foot = { x, z, y };
      outcome = "stepped";
      // A stair whose front lands within half a block of natural ground is the
      // last one the flight needs.
      if (y <= g + 1) break;
      y--;
    }

    if (outcome === "stepped" && !footLands(foot, dx, dz)) {
      // Stairs to nowhere. The flight climbs a raw graded bank — a terrace seam
      // that was refused a retaining wall (LOAM-W411) — and its bottom stair has
      // nothing beside it a walker could step onto. Drop the whole proposal: no
      // masonry, no `touched` claim, no cuts. The door keeps a plain sill and
      // reads as what it is.
      refused++;
      continue;
    }
    for (const idx of walked) touched[idx] = 1;
    blocks.push(...flight);

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
      const intent = {
        source,
        sourceClass: "doorstep.landing" as const,
        kind: "platform" as const,
        columns: cuts,
        transition: "step" as const,
      };
      // **One commit for the whole tier** under the freeze (§6a.10 ii). The
      // per-door commit's stated reason — "so the next door reads the answer
      // rather than the request" — is already dead at G6: the view is taken
      // *once* before this loop, at `driver.view("D")`, and a tier-D commit is
      // invisible to a tier-D reader by construction. Two doors cutting one
      // column now settle by rank and then by claim order, the resolver's own
      // stated tie-break, deterministically. With the flag off the per-door
      // commit stays exactly where it was, because its write-through is still
      // observable there and moving it would move a byte.
      if (GROUND_V1_FREEZE) tierClaims.push(intent);
      else driver.commit([intent]);
      // §9 step 2's second loop — held rather than applied on the declaring
      // path, so a material write does not change places with another pass's
      // (see {@link DoorstepInput.deferMaterials}).
      for (const cut of cuts) {
        if (input.deferMaterials === true) materials.push({ idx: cut.idx, surface: stepState });
        else {
          plan.surface[cut.idx] = stepState;
          if (plan.soil[cut.idx] === 0) plan.soil[cut.idx] = 1;
        }
      }
    }
  }

  // §6a.10 ii's other half: the tier's claims, in door order, as one commit.
  if (tierClaims.length > 0) driver.commit(tierClaims);

  return { blocks, stepped, dropped, flush, refused, touched, declarations, materials };
}
