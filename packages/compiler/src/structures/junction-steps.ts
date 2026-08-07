/**
 * **Junction steps** — the pass that stops one paved surface biting a hole out
 * of the one beside it.
 *
 * ## The defect
 *
 * The dressing audit (`emit/dressing.ts`, detector 2b) counts every column an
 * emitter declared as paving that sits **two or more blocks below a paved
 * column beside it**. On the hillside fixtures that is a rectangular bite out
 * of the street: a bare vertical riser between two surfaces that both think
 * they are finished, with no stair, no slab and no tread anywhere on it. Every
 * one of them is legal, connected, well-formed geometry — the two columns are
 * simply not an edge — which is why no pass's own test ever caught it.
 *
 * ## Why they happen, measured rather than assumed
 *
 * `docs/DESIGN.md` names one mechanism ("the ownership pin binds centre-line
 * *cells*; the contract says *columns*") and it is not the one the fixtures
 * show. Dumping every cutoff on both hillside documents with the segment that
 * owns it and the segment beside it gives **three** populations, and only the
 * third is a pin problem at all:
 *
 * 1. **A seam between two surfaces that share no column.** The dominant case.
 *    `surfaceStreetGraph`'s claim phase *partitions* the columns — a flight
 *    descending a hill takes the ones it sweeps, the contour street below takes
 *    the rest — so at the line where the two footprints meet there is nothing
 *    shared to pin. On `site-plan-hillside-steep` the carriage spine `sp0` runs
 *    two to four blocks above the terrace street `hs2_0` for **fourteen
 *    consecutive columns**; they abut along their whole length and never
 *    overlap by one cell. Pinning shared columns cannot touch this, because
 *    there are no shared columns.
 * 2. **A surface some *later* pass moved.** Every road cutoff on both fixtures
 *    is a `road:` column whose neighbour is declared by the same route *and* by
 *    `doorsteps` — the doorstep pass raised one column of a lane it did not
 *    own, two blocks above the lane's own next column. Same for the one
 *    `plaza` cutoff.
 * 3. **A segment's own cross-section**, where the arc frame's stations step two
 *    at once across a diagonal and two raster-adjacent columns of one segment
 *    land two apart.
 *
 * Three mechanisms, three owners, one artifact. So the treatment is not a
 * change to any one of them: it is a **reconciliation pass over the finished
 * paving**, which is the only place all three are visible at once.
 *
 * ## What it does
 *
 * Kai's ratified principle — *a connection earns its drop with run* — read at
 * the smallest scale there is. Where paving stands two or more blocks over
 * paving, the **low side climbs to meet it**, one block per column, over as
 * many columns of its own surface as the drop needs:
 *
 * ```
 *  before                          after
 *    ▓▓▓ 161  (the spine)            ▓▓▓ 161
 *    ░                               ░ ▟  160
 *    ░                               ░▟▀  159
 *    ░░░░ 158 (the terrace)          ▟▀░░ 158
 * ```
 *
 * The lift is a **bounded Lipschitz relaxation** over the paved columns: each
 * round, any liftable column with a paved neighbour two or more above it rises
 * by one, synchronously, until nothing moves. That is a staircase by
 * construction — the column at the seam ends highest, the one behind it one
 * lower — and it is bounded twice over, by {@link MAX_JUNCTION_LIFT} on any one
 * column and by whether the column is free to move at all. Nothing propagates
 * across a town: the relaxation only ever touches columns within
 * `MAX_JUNCTION_LIFT` of a seam.
 *
 * Every column the pass raises, **and every column it could not raise that is
 * still cut**, gets a stair laid *into* its top course — the same convention
 * `street-stairs.ts` uses for a flight's own tread mix, and the same convention
 * the audit reads (`nameAt(x, feet − 1, z)`). A raised column reads as a step
 * you walk up; a column that could not move reads as a nosing at the edge,
 * which is a kerb rather than a stair and is honestly less than the drop
 * deserves. The residue is counted and returned
 * ({@link JunctionStepResult.unresolved}) rather than hidden.
 *
 * ## Why it mutates the plan rather than emitting over it
 *
 * A lift is a change of *ground*, not a decoration: the heightmap, the biome
 * clamp and every later pass have to see it, and a column of structure blocks
 * standing on unchanged `plan.ground` is exactly the "floating dressing" defect
 * the audit's first detector exists to find. So `ground`, `soil` and
 * `subsurface` move together — the riser is built out of the paving's own
 * material, so a three-block step does not show a dirt face — and the terrain
 * writer builds it as ground.
 *
 * This runs **after** the ground contract has committed, which is deliberate
 * and is the pass's one real cost. It cannot run before: two of its three
 * mechanisms only exist once `doorsteps` and the plaza have had their say, and
 * a reconciliation that cannot see the surface that caused the cut is not a
 * reconciliation. What it gives up is the contract's arbitration, and it pays
 * that back by never *lowering* anything and never touching a column that
 * carries anything at all above its own ground — see {@link occupiedAbove}.
 *
 * The declarations are deliberately **not** rewritten. The audit anchors its
 * standing-cell search to the declared level and searches `LEVEL_SLACK` (3)
 * outwards from it, so a lift of at most three is found from a stale hint;
 * {@link MAX_JUNCTION_LIFT} is that number and not a coincidence.
 */

import type { Region } from "@terrainist/stdlib";

import type { PrismarineStack } from "../emit/prismarine.js";
import {
  INTENT_RANK,
  type GroundClaim,
  type GroundSourceClass,
} from "../layout/ground-contract.js";
import type { GroundDriver } from "../layout/ground-driver.js";
import { FluidKind, type ColumnPlan } from "../terrain/columns.js";
import type { Palette } from "../terrain/palette.js";

import type { StructureBlock } from "./buildings.js";

/* -------------------------------------------------------------------------- */
/* tuning                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Most blocks one column may be raised to meet the paving beside it.
 *
 * Three, for two independent reasons that happen to agree. Architecturally it
 * is the tallest thing that still reads as a step rather than a wall — a
 * four-block lift on the edge of a terrace is a plinth, and the audit has a
 * detector for those. Mechanically it is `walkability.ts`' `LEVEL_SLACK`: the
 * audit finds a column's standing cell by searching outwards from the level the
 * emitter *declared*, three either way, and this pass leaves the declaration
 * alone. A lift of four would put the walking surface outside the window and
 * the column would read as `buried` — a defect invented by the fix for another.
 */
export const MAX_JUNCTION_LIFT = 3;

/**
 * The audit's own bar: one block is the step a graded street takes by design,
 * two is a hole. Kept as a named constant because it is the whole trigger.
 */
export const JUNCTION_CUT = 2;

/**
 * Rounds of relaxation before the pass gives up.
 *
 * A staircase of `n` steps needs about `2n` synchronous rounds to form — the
 * column at the seam has to rise twice before the one behind it sees a
 * two-block difference of its own — so `2 · MAX_JUNCTION_LIFT` plus a margin.
 * It is a guard, not a schedule: the loop exits the round nothing moves.
 */
const MAX_ROUNDS = 3 * MAX_JUNCTION_LIFT + 2;

/**
 * Within-class ordering for the lift's own claim. **Lower wins** (§4.1).
 *
 * Below every `subRank` any class assigns itself — `street.network` uses the
 * position in the `compareStreetRank` sort, which is a small non-negative
 * integer, and `pad.record` uses `−i` over the pad list. A large negative
 * number rather than `−1`, so a class that grows a negative ordering of its own
 * later does not silently overtake the step at the junction it is arriving at.
 */
const JUNCTION_SUBRANK = -1_000_000;

/* -------------------------------------------------------------------------- */
/* input and output                                                            */
/* -------------------------------------------------------------------------- */

/**
 * What kind of paving declared a column.
 *
 * The distinction that matters is `doorstep`: a doorstep is a *threshold*, at
 * the level the building's own floor put it, and raising one is how you brick
 * up a front door. Everything else is fair game.
 */
export type PavedKind = "street" | "steps" | "road" | "plaza" | "doorstep";

/** One emitter's declared paving, as this pass needs to see it. */
export interface PavedSurface {
  readonly kind: PavedKind;
  /**
   * The precedence class the emitter declared this paving under.
   *
   * Carried because **a lift is a change of ground and has to be declared as
   * one** (`docs/GROUND-CONTRACT-v0.md` §3, §8). Without it the resolver would
   * answer with the level the street asked for while the pipeline had written
   * the level the step arrived at, and the equivalence shim would call the
   * difference an unattributable divergence on six worlds — which it did, and
   * which is why this field exists rather than a comment apologising for its
   * absence.
   */
  readonly sourceClass: GroundSourceClass;
  /** Column indices, row-major over the plan's region. */
  readonly columns: Iterable<number>;
}

export interface JunctionStepInput {
  readonly region: Region;
  /** Mutated in place: `ground`, `soil` and `subsurface` of lifted columns. */
  readonly plan: ColumnPlan;
  readonly stack: PrismarineStack;
  /** For the `ground.stairs` role; absent in unit tests, which get the default. */
  readonly palette?: Palette;
  readonly paved: readonly PavedSurface[];
  /**
   * The ground contract's driver. The lift is committed through it, under the
   * class that already owns each column, so the resolver and the pipeline give
   * the same answer. Optional only for the unit tests, which grade a bare plan.
   */
  readonly ground?: GroundDriver;
  /**
   * Every structure block laid so far.
   *
   * The occupancy guard, and the reason this pass can run late without
   * knocking a lamp post off its own pavement: a column carrying anything above
   * its ground is never raised.
   */
  readonly blocks: readonly StructureBlock[];
}

/** One column this pass changed, for the report and for the tests. */
export interface JunctionStep {
  readonly x: number;
  readonly z: number;
  /** The ground level before the pass ran. */
  readonly from: number;
  /** …and after. Equal to `from` for a nosing. */
  readonly to: number;
  /** Blocks the highest paved neighbour still stands above the new level. */
  readonly residual: number;
}

export interface JunctionStepResult {
  readonly blocks: readonly StructureBlock[];
  /** Columns raised to climb towards the paving beside them. */
  readonly lifted: number;
  /** Columns dressed where they stood, because they could not be raised. */
  readonly nosed: number;
  /**
   * Columns still two or more below a paved neighbour **and** carrying no
   * stair — what the audit will still count. The honest residue; zero is the
   * bar.
   */
  readonly unresolved: number;
  /** How much was lifted, by lift: `"1"`, `"2"`, `"3"`. */
  readonly liftHistogram: Readonly<Record<string, number>>;
  /** The worst cuts the pass touched, deepest first. */
  readonly worst: readonly JunctionStep[];
}

/** How many rows {@link JunctionStepResult.worst} carries. */
export const WORST_STEPS = 8;

/* -------------------------------------------------------------------------- */
/* the pass                                                                    */
/* -------------------------------------------------------------------------- */

const NEIGHBOURS8 = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;

/**
 * Reconcile every seam between two paved surfaces that abut at two blocks or
 * more, and dress what is left.
 *
 * Deterministic by construction: the relaxation is synchronous (a round reads
 * only the previous round's levels), so the result does not depend on the order
 * the surfaces were declared in, and the emitted blocks are sorted by column.
 */
export function buildJunctionSteps(input: JunctionStepInput): JunctionStepResult {
  const { region, plan, stack } = input;
  const cells = region.width * region.depth;

  /* --- who is paved, and who may move ------------------------------------ */

  const paved = new Uint8Array(cells);
  /** 1 where a doorstep declared the column: paved, and pinned to its door. */
  const threshold = new Uint8Array(cells);
  /** 1 where a flight declared the column: paved, and pinned to the tread law. */
  const flight = new Uint8Array(cells);
  /**
   * The class whose claim *wins* each paved column — the lowest rank of any
   * that declared it. A lift has to be declared under that one or it does not
   * win the column, and the resolver would answer with the level underneath it.
   */
  const winner = new Map<number, GroundSourceClass>();
  for (const surface of input.paved) {
    for (const idx of surface.columns) {
      if (idx < 0 || idx >= cells) continue;
      paved[idx] = 1;
      if (surface.kind === "doorstep") threshold[idx] = 1;
      if (surface.kind === "steps") flight[idx] = 1;
      const held = winner.get(idx);
      if (held === undefined || INTENT_RANK[surface.sourceClass] < INTENT_RANK[held]) {
        winner.set(idx, surface.sourceClass);
      }
    }
  }

  const { mask: occupied, standing } = occupiedAbove(input, paved);

  const top = Int32Array.from(standing);
  const lift = new Int32Array(cells);
  const movable = new Uint8Array(cells);
  for (let idx = 0; idx < cells; idx++) {
    if (paved[idx] !== 1) continue;
    if (threshold[idx] === 1) continue;
    // A flight's levels are the tread law's, not this pass's: raising one
    // column of a run breaks the rhythm the whole flight was solved for, and
    // measured on `site-plan-hillside` it buys a 14-column run of stair
    // standing proud of the ground either side — the audit's third defect,
    // created by the fix for its second. A flight that is cut still gets its
    // nosing; it just does not climb.
    if (flight[idx] === 1) continue;
    // Anything already written into or onto this column pins it. A lamp would
    // be buried by the lift; a flight's own tread slab would be *stamped into
    // the middle of the riser*, because structure blocks are laid over the
    // finished terrain and that one was queued at the old level.
    if (occupied[idx] !== 0) continue;
    // A deck over water is held at the fluid surface by the bridge kit; raising
    // it would lift the deck off its own piers.
    if (plan.fluidKind[idx] !== FluidKind.NONE) continue;
    movable[idx] = 1;
  }

  /* --- the relaxation ----------------------------------------------------- */

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let changed = false;
    const next = Int32Array.from(top);
    // Snapshotted with the levels: a round reads only what the round before it
    // settled, so the result cannot depend on the order the grid is scanned in.
    const lifted0 = Int32Array.from(lift);
    for (let z = 0; z < region.depth; z++) {
      for (let x = 0; x < region.width; x++) {
        const idx = z * region.width + x;
        if (movable[idx] !== 1) continue;
        if ((lift[idx] as number) >= MAX_JUNCTION_LIFT) continue;
        if (highestNeighbour(region, paved, top, x, z).y - (top[idx] as number) < JUNCTION_CUT) {
          continue;
        }
        // **A step is only earned if the ground behind it can follow.** Raising
        // this column deepens whatever falls away from it by exactly one, and a
        // neighbour that cannot rise in a later round is where that lands: an
        // unclaimed bank, a doorstep at its threshold, a flight on its own tread
        // law. Measured on `site-plan-hillside-steep`, lifting into one turned a
        // four-block face with forty-seven columns of run into a three-block one
        // with five — shallower, and no longer earned. So the climb stops one
        // column short of the thing it cannot bring with it, and the audit's
        // second defect is settled there with a nosing instead.
        if (wouldStrand(region, top, movable, lifted0, x, z)) continue;
        // **And a step is never a causeway.** `emit/physics.ts`' `road.proud`
        // rule fails a lane whose surface stands above the ground two columns
        // out on *all four* axes, because that is what the first village's
        // roads looked like and it is a hard gate rather than a preference.
        // A lift can produce one where a doorstep, not the terrain, is what
        // stands high beside the lane: the neighbour a column climbs towards is
        // one cell away and the rule samples two. Measured on
        // `hillside-village`, nine lane cells came out three and four proud.
        if (wouldBeCauseway(region, top, x, z)) continue;
        next[idx] = (top[idx] as number) + 1;
        lift[idx] = (lift[idx] as number) + 1;
        changed = true;
      }
    }
    top.set(next);
    if (!changed) break;
  }

  /* --- apply: the plan first, then the tread ------------------------------ */

  const stairName = roleBlockName(input.palette, "ground.stairs", "stone_brick_stairs", stack);
  const blocks: StructureBlock[] = [];
  const steps: JunctionStep[] = [];
  let lifted = 0;
  let nosed = 0;
  let unresolved = 0;
  const histogram = new Map<string, number>();
  /** The lift, as claims, grouped by the class that wins each column. */
  const claims = new Map<GroundSourceClass, GroundClaim[]>();

  for (let z = 0; z < region.depth; z++) {
    for (let x = 0; x < region.width; x++) {
      const idx = z * region.width + x;
      if (paved[idx] !== 1) continue;
      const rise = lift[idx] as number;
      // The **top course**, which is the plan's ground unless something was
      // stacked on it. `rise` is only ever non-zero where nothing was.
      const before = standing[idx] as number;
      const after = before + rise;
      const highest = highestNeighbour(region, paved, top, x, z);
      const residual = highest.y - after;
      // Nothing to say about a column that was never cut and was never raised.
      if (rise === 0 && residual < JUNCTION_CUT) continue;

      if (rise > 0) {
        // The riser is the paving's own material, not the hill's: a three-block
        // step showing a dirt face is the plinth defect wearing a stair.
        plan.ground[idx] = (plan.ground[idx] as number) + rise;
        plan.soil[idx] = Math.max(plan.soil[idx] as number, rise + 1);
        plan.subsurface[idx] = plan.surface[idx] as number;
        lifted++;
        const key = String(rise);
        histogram.set(key, (histogram.get(key) ?? 0) + 1);
        const cls = winner.get(idx) as GroundSourceClass;
        const bucket = claims.get(cls);
        if (bucket === undefined) claims.set(cls, [{ idx, y: after }]);
        else bucket.push({ idx, y: after });
      }

      // A column whose top course already carries a dressing block — a flight's
      // own tread — is dressed where it stands, and re-laying it would swap one
      // stair for another while moving a denominator the audit pins.
      const alreadyDressed = occupied[idx] === 2;
      // The tread, laid *into* the top course. `street-stairs.ts` lays a
      // flight's mix the same way and for the same reason: a dressing block on
      // top of the surface is a block standing on the pavement, which is a
      // different defect in the same audit.
      const state = alreadyDressed
        ? undefined
        : stack.blockStateOf(stairName, {
            facing: facingOf(highest.dx, highest.dz),
            half: "bottom",
            shape: "straight",
            waterlogged: "false",
          });
      if (state !== undefined) {
        blocks.push({ x: region.x0 + x, y: after, z: region.z0 + z, stateId: state });
        if (rise === 0) nosed++;
      }
      if (residual >= JUNCTION_CUT) {
        if (state === undefined && !alreadyDressed) unresolved++;
        steps.push({ x: region.x0 + x, z: region.z0 + z, from: before, to: after, residual });
      }
    }
  }

  // **The declaration, last** (`docs/GROUND-CONTRACT-v0.md` §9 step 2): one
  // `platform` per winning class, at a `subRank` below anything that class
  // orders itself by, because a step is the street's *own* ground at the
  // junction and it has to outrank the street's body to be the answer there.
  // Grouped by winner rather than by declarer so a lane column a doorstep also
  // named is claimed under `road.network`, which is the class that holds it.
  if (input.ground !== undefined && claims.size > 0) {
    input.ground.commit(
      [...claims]
        .sort(([a], [b]) => INTENT_RANK[a] - INTENT_RANK[b])
        .map(([sourceClass, columns]) => ({
          source: `junction.steps#${sourceClass}`,
          sourceClass,
          kind: "platform" as const,
          columns,
          transition: "step" as const,
          subRank: JUNCTION_SUBRANK,
        })),
    );
  }

  steps.sort((a, b) => b.residual - a.residual || a.x - b.x || a.z - b.z);

  return {
    blocks,
    lifted,
    nosed,
    unresolved,
    liftHistogram: Object.fromEntries([...histogram].sort(([a], [b]) => (a < b ? -1 : 1))),
    worst: steps.slice(0, WORST_STEPS),
  };
}

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * True when raising this column by one would leave a neighbour it cannot bring
 * with it two or more blocks below.
 *
 * Four-connected, and it reads the *plan* for anything the paving does not
 * cover, because the question is what the face under the kerb does and a face
 * is what you would fall off whether or not anybody declared the bottom of it.
 * A neighbour that is free to rise and has lift left is not stranded — it will
 * follow in a later round, which is exactly how the staircase forms.
 */
function wouldStrand(
  region: Region,
  top: Int32Array,
  movable: Uint8Array,
  lift: Int32Array,
  x: number,
  z: number,
): boolean {
  const idx = z * region.width + x;
  const after = (top[idx] as number) + 1;
  for (const [dx, dz] of NEIGHBOURS4) {
    const nx = x + dx;
    const nz = z + dz;
    if (nx < 0 || nz < 0 || nx >= region.width || nz >= region.depth) return true;
    const nidx = nz * region.width + nx;
    if ((top[nidx] as number) > after - JUNCTION_CUT) continue;
    if (movable[nidx] === 1 && (lift[nidx] as number) < MAX_JUNCTION_LIFT) continue;
    return true;
  }
  return false;
}

/**
 * True when raising this column by one would leave it standing above the ground
 * two columns out on every axis — `emit/physics.ts`' `road.proud`, asked before
 * the fact instead of after it.
 */
function wouldBeCauseway(region: Region, top: Int32Array, x: number, z: number): boolean {
  const after = (top[z * region.width + x] as number) + 1;
  for (const [dx, dz] of NEIGHBOURS4) {
    const nx = x + 2 * dx;
    const nz = z + 2 * dz;
    if (nx < 0 || nz < 0 || nx >= region.width || nz >= region.depth) return false;
    if ((top[nz * region.width + nx] as number) >= after) return false;
  }
  return true;
}

const NEIGHBOURS4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** The highest paved neighbour of a column, and the way to it. */
function highestNeighbour(
  region: Region,
  paved: Uint8Array,
  top: Int32Array,
  x: number,
  z: number,
): { readonly y: number; readonly dx: number; readonly dz: number } {
  let best = Number.NEGATIVE_INFINITY;
  let bestCardinal = Number.NEGATIVE_INFINITY;
  let dx = 0;
  let dz = -1;
  let cx = 0;
  let cz = -1;
  for (const [ox, oz] of NEIGHBOURS8) {
    const nx = x + ox;
    const nz = z + oz;
    if (nx < 0 || nz < 0 || nx >= region.width || nz >= region.depth) continue;
    const nidx = nz * region.width + nx;
    if (paved[nidx] !== 1) continue;
    const y = top[nidx] as number;
    if (y > best) {
      best = y;
      dx = ox;
      dz = oz;
    }
    if ((ox === 0 || oz === 0) && y > bestCardinal) {
      bestCardinal = y;
      cx = ox;
      cz = oz;
    }
  }
  // **The height is eight-connected and the facing is four-connected**, and
  // they are answered separately on purpose. The height has to match the
  // audit's own neighbourhood or the pass and the ruler disagree about what a
  // cut is. The facing has four choices, and reducing a diagonal to a cardinal
  // can land the stair's full-height half against a column at the *same* level
  // — a step with its back to nothing. So the facing is the best cardinal
  // neighbour whenever one rises at all, and only falls back to the diagonal's
  // axis when none does.
  if (bestCardinal > (top[z * region.width + x] as number)) {
    dx = cx;
    dz = cz;
  }
  return { y: best === Number.NEGATIVE_INFINITY ? Number.NEGATIVE_INFINITY : best, dx, dz };
}

/**
 * Columns carrying something above their own ground, and columns whose top
 * course is already dressed.
 *
 * `1` — something stands on this column: a lamp, a balustrade, a wall, a
 * building. Raising it would leave whatever it is buried or floating, so the
 * column is frozen. `2` — the top course itself is a slab or a stair, which is
 * the flight's own tread mix: already dressed, nothing to do, and re-laying it
 * would move a denominator the audit pins.
 *
 * One pass over the block list with a paved-column filter, which is why the
 * mask is built here rather than asked of the plan: `plan.soil` and friends
 * know what the *ground* is, and this question is about what was put on it.
 */
function occupiedAbove(
  input: JunctionStepInput,
  paved: Uint8Array,
): { readonly mask: Uint8Array; readonly standing: Int32Array } {
  const { region, plan, stack } = input;
  const cells = region.width * region.depth;
  const mask = new Uint8Array(cells);
  const standing = Int32Array.from(plan.ground);
  /** `idx → y → block`, for the paved columns only. */
  const above = new Map<number, Map<number, number>>();
  for (const block of input.blocks) {
    const x = block.x - region.x0;
    const z = block.z - region.z0;
    if (x < 0 || z < 0 || x >= region.width || z >= region.depth) continue;
    const idx = z * region.width + x;
    if (paved[idx] !== 1) continue;
    const ground = plan.ground[idx] as number;
    if (block.y > ground) {
      mask[idx] = 1;
      let column = above.get(idx);
      if (column === undefined) {
        column = new Map();
        above.set(idx, column);
      }
      column.set(block.y, block.stateId);
      continue;
    }
    if (block.y !== ground || mask[idx] === 1) continue;
    const name = stack.blockNameByStateId(block.stateId);
    if (name !== undefined && /(_slab|_stairs)$/.test(name)) mask[idx] = 2;
  }

  // **The surface a walker actually finds.** A doorstep does not move
  // `plan.ground`; it *stacks blocks on it*, and every road cutoff on both
  // hillside fixtures is a lane column beside a doorstep that did exactly that.
  // A pass that compared plan levels would see two columns at the same height
  // and a walker would see a two-block riser — so the height this pass
  // reconciles is the top of the contiguous stack of standable material above
  // the plan's ground, which is what the audit reads back out of the world.
  // A lamp post or a balustrade stops the climb at once: a wall block is
  // neither a full cube nor a tread, and you do not stand on top of one.
  for (const [idx, column] of above) {
    let y = plan.ground[idx] as number;
    for (;;) {
      const state = column.get(y + 1);
      if (state === undefined) break;
      const name = stack.blockNameByStateId(state);
      if (!stack.isFullCube(state) && !(name !== undefined && /(_slab|_stairs)$/.test(name))) break;
      y++;
    }
    standing[idx] = y;
  }
  return { mask, standing };
}

/**
 * The block name behind a **ground role**, for a dressing that needs properties.
 *
 * Deliberately a copy of `street-stairs.ts`' private helper of the same shape:
 * that module does not export it, it is four lines, and a back-import between
 * two modules `roads.ts` already imports both of is a cycle for no gain.
 */
function roleBlockName(
  palette: Palette | undefined,
  role: string,
  fallback: string,
  stack: PrismarineStack,
): string {
  if (palette === undefined || !palette.has(role)) return fallback;
  return stack.blockNameByStateId(palette.state(role)) ?? fallback;
}

/**
 * The cardinal name of a step, for a stair's `facing`.
 *
 * The same convention `street-stairs.ts` uses: **facing points uphill**, so the
 * stair's full-height half stands against the surface being climbed and its
 * half-height half meets the pavement you arrive from.
 */
function facingOf(dx: number, dz: number): string {
  if (dx > 0) return "east";
  if (dx < 0) return "west";
  return dz > 0 ? "south" : "north";
}
