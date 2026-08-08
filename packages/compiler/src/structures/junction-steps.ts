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
 * Every column that ends up **one block under the surface it faces** gets a
 * stair laid *into* its top course — the same convention `street-stairs.ts`
 * uses for a flight's own tread mix, and the same convention the audit reads
 * (`nameAt(x, feet − 1, z)`). That is the only shape laid, and the restriction
 * is the 2026-08-08 walk fix; see below.
 *
 * ## What Kai walked on 2026-08-08, and the three rules it bought
 *
 * Two worlds, one diagnosis: **every defect was this pass working outside its
 * remit.** A reconciliation pass closes a seam between two finished surfaces. It
 * is not a grader, not a stair-builder and not a mason, and each of the three
 * shapes below is it trying to be one of those.
 *
 * 1. **"Random useless stairs"** — a stair block laid flat in otherwise level
 *    pavement, connecting nothing. Every one of them was this module's own
 *    invention, the **kerb**: where a cut was too deep to climb, it laid the
 *    tread anyway, "an honest half-answer", full-height half against the wall.
 *    But a nosing is architecture on the side you *look over* and this pass only
 *    ever dresses the **low** side, so a kerb here is always a stair standing at
 *    the foot of something unclimbable. Measured off the finished world
 *    (`emit/dressing.ts`, `sunkenStairs`): 16 on the steep fixture, 241 on
 *    harbourtown with the gate forced on, every one a kerb or a backless tread.
 *    So a tread is now laid **only where it is a step** — one block under the
 *    thing it faces — and only where paving lies on its own axis. The cut it
 *    leaves goes to {@link JunctionStepResult.unresolved} and the audit's
 *    `undressedCutoffs`, which rose from 0 to 7 and 5 on the two fixtures. That
 *    is the honest number and it is the point: a bare riser the ledger can see
 *    beats a stair that lies about being a way up.
 * 2. **A jog in a tread line** — "a recessed stair slot where treads misalign",
 *    at `(62 … 63, 12)` on the steep fixture. The relaxation is synchronous and
 *    each column asks its own neighbourhood, so where the high side steps along
 *    its own run, one column sees a two-block cut a round before its neighbour
 *    does — and by the time the neighbour looks, the cut has closed to one and
 *    it never climbs. An **alignment round** now fills a hole up to
 *    {@link NOTCH_SPAN} columns wide that is pinched between lifted columns on
 *    one axis, under exactly the guards the climb obeys.
 * 3. **A cascade** — "a wide cascade of mossy-cobble steps terracing an entire
 *    natural waterfront slope down to a dock". Every guard in this module is
 *    *local*, and on a hillside the local answer is yes hundreds of times over.
 *    The lift is now grouped into connected patches and judged **as a patch**
 *    against {@link MAX_SEAM_THICKNESS} and {@link MAX_SEAM_COLUMNS}: a seam is a
 *    band, a slope is not, and a patch that is a slope is put back whole
 *    ({@link JunctionStepResult.refused}). It takes harbourtown's largest
 *    connected patch of junction dressing from 178 columns to 46 while its
 *    orphan columns and components come out at 299 and 196 against 300 and 197 —
 *    the refusal costs the network nothing.
 *
 * ## What is not a cut: a stoop's cheek (walked 2026-08-07)
 *
 * `occupiedAbove` promotes a column to the top of the masonry standing on it,
 * because a doorstep does not move `plan.ground` — it *stacks stairs on it* —
 * and a pass that compared plan levels would see two columns level where a
 * walker meets a two-block riser. That is right, and it has one wrong
 * consequence: the lane beside a doorstep flight reads as two blocks below
 * "paving", so the pass climbed it.
 *
 * On `site-plan-hillside` at `(−80, −216)` the ground is 176 for every column
 * in sight — **nothing there is a hill**. A cottage door at 179 puts a tread at
 * 178 and another at 177 one column out; the lane column beside the *lower*
 * tread was raised to 177 and dressed facing east, and the one beside the
 * *upper* tread was nosed at 176 facing east, and the pair read as a two-step
 * staircase built sideways next to the door's own. Kai walked it as "two
 * unnecessary sideways stairs", and it is the same mechanism that produced
 * every one of the thirty-two lifts on the flat `showcase-bayline`.
 *
 * The cheek of a step is architecture, not a hole. A door is served **along**
 * its flight, whose foot is at lane level a column further out; nobody enters a
 * house across the side of its stoop. So the lift's trigger reads the paving
 * *without* the doorsteps ({@link highestNeighbour}'s `skip`), and the cut is
 * settled with a nosing where it stands. It costs four cutoff rows on
 * `site-plan-hillside` and three on the steep fixture — counted, dressed, and
 * `undressedCutoffs` still nought — and it buys back dead-flat pavement.
 *
 * Two detectors keep it: {@link JunctionStepResult.stoopLifts}, columns raised
 * with nothing but a doorstep at or above the level they reached, and
 * {@link JunctionStepResult.backless}, treads turned across everything they
 * touch. Both are read off the finished grid rather than off the rule that
 * produced it, so neither is a restatement of the fix. See {@link stepFacing}.
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
 * The thickest a lift may be, averaged over the seam it runs along.
 *
 * **The scale rule, and the one Kai's 2026-08-08 walks are about.** A seam is a
 * *line*: two finished surfaces meet along an edge and the low one climbs a
 * band of at most {@link MAX_JUNCTION_LIFT} columns to reach it, so the patch of
 * lifted ground is long and thin — `columns / longest side` is at most three by
 * construction. A **slope** is not a line, and terracing one produces a patch
 * that is thick in both directions.
 *
 * Measured on the two walked worlds: the hillside fixtures' largest lifted patch
 * runs 2.4 columns thick and the unit-test seam 2.0 — both bands. On
 * `c1-harbourtown` with the gate forced on, the patches that terrace a gradient
 * run 4.8, 4.9, 5.1, 6.1 and 6.2, and the one Kai walked as "a wide cascade of
 * mossy-cobble steps terracing an entire natural waterfront down to a dock" is
 * in that group.
 *
 * **Four, and the fourth column is measured rather than argued.** Three is where
 * the mechanism says the bar is — a band that climbs three blocks is three
 * columns wide — but a seam that runs on the diagonal measures a column wider
 * than it is, because the raster steps sideways as it steps along. At three the
 * refusal takes five harbourtown patches of thickness 3.3 to 3.8 with it, and
 * those are real seams: refusing them costs the town **20,638 orphan columns**
 * against 300 with them kept. At four, harbourtown's orphans and components come
 * out at 299 and 196 against 300 and 197 — no regression at all — and every
 * gradient-terracing patch is still refused. The number is where those two
 * measurements meet.
 *
 * A patch over the bar is refused **whole** — every column of it put back where
 * it started. Grading a hillside is `layout/levels.ts`' job and it has benches,
 * retaining and a flight solver to do it with; this pass has one block of lift
 * per column and no plan, and what it produces at that size is a staircase
 * poured over a beach.
 */
export const MAX_SEAM_THICKNESS = MAX_JUNCTION_LIFT + 1;

/**
 * …and an absolute ceiling on one patch, whatever its shape.
 *
 * The thickness rule alone lets a single component grow without limit as long as
 * it grows lengthwise, and on harbourtown that licence is taken: one patch runs
 * **178 columns** along a 166-column front at a thickness of 1.07. Thin or not,
 * that is not a junction — it is a shoreline — and it is the single largest
 * connected patch of junction dressing on any world measured.
 *
 * Sixty-four columns is four times the widest junction this compiler lays (a
 * nine-wide avenue meeting a seven-wide street), comfortably above both hillside
 * fixtures' worst patch of 31 and above the 34-column seam the unit tests pin.
 * Capping there takes harbourtown's largest dressed component from 178 to 46 and
 * costs one orphan column and one component — measured, both directions.
 */
export const MAX_SEAM_COLUMNS = 64;

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
  /**
   * Columns dressed **without being raised**: a step laid where the column
   * already stood one under the surface it faces.
   *
   * Until 2026-08-08 this also counted the *kerb* — a tread at the foot of a
   * face too deep to climb — which is why the name is what it is. Those are no
   * longer laid at all, so every row in this number is now a step.
   */
  readonly nosed: number;
  /**
   * Columns still two or more below a paved neighbour **and** carrying no
   * stair — what the audit will still count as `undressedCutoffs`.
   *
   * **Zero stopped being the bar on 2026-08-08.** It was reached by dressing
   * every cut whatever its depth, and half of what that laid was the "random
   * useless stairs" Kai walked. This is now the pass's honest refusal: a cut it
   * has no step to offer, named rather than papered over. It should go down, by
   * the two surfaces meeting at a level a step can bridge or by a flight being
   * built between them — never by dressing a wall's foot again.
   */
  readonly unresolved: number;
  /**
   * Dressed steps turned across everything they touch — full-height half
   * against a column at their own level or below. See {@link stepFacing}; this
   * is the 2026-08-07 walk defect as a number, and **zero is the bar**.
   */
  readonly backless: number;
  /**
   * Columns raised whose only paving at or above the level they reached is a
   * **doorstep**. See {@link onlyStoopAbove} — this is the defect Kai walked on
   * 2026-08-07 stated as a measurement of the finished grid, and **zero is the
   * bar**.
   */
  readonly stoopLifts: number;
  /**
   * Columns whose lift was withdrawn because the patch they belonged to was a
   * **slope rather than a seam**, and how many patches that was. See
   * {@link MAX_SEAM_THICKNESS}: this is the pass declining work it has no plan
   * for, and a large number here on a flat town is the reason the gate exists.
   */
  readonly refused: number;
  readonly refusedPatches: number;
  /** The largest patch of lift the pass kept, in columns. */
  readonly largestSeam: number;
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

  const { mask: occupied, standing, built } = occupiedAbove(input, paved);

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
        // **A stoop's cheek is not a cut, and climbing it earns nothing.**
        // The trigger reads the paving *without* the doorsteps, which is the
        // 2026-08-07 walk defect stated as one condition. A doorstep is a
        // flight of its own: `occupiedAbove` promotes its columns to the top of
        // the masonry it stacked, so the lane beside a two-stair stoop reads as
        // two blocks below "paving" — but that paving is the **side** of a
        // step, and nobody enters a door across it. The door is served along
        // the flight, whose own foot is at lane level one column on. Lifting
        // towards it put a one-block hump in dead-flat pavement and dressed it
        // facing the stoop, and Kai walked the pair as "two unnecessary
        // sideways stairs". The cut is still *dressed* below — the audit counts
        // it and it is real masonry to nose — it is simply not climbed.
        if (
          highestNeighbour(region, paved, top, x, z, threshold).y - (top[idx] as number) <
          JUNCTION_CUT
        ) {
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

  /* --- alignment: a tread line with a notch in it is not a tread line ----- */
  //
  // **Kai's 2026-08-08 walk, defect 1** — "a recessed stair slot with a
  // one-block jog where treads misalign" — measured at `(62 … 63, 12)` on
  // `site-plan-hillside-steep`. The relaxation is synchronous and every column
  // asks its *own* neighbourhood whether it is cut, so where the high side is a
  // flight whose own level steps along its run, one column of the low side sees
  // a two-block cut in round 0 and the column beside it sees one in round 1 —
  // by which time the first has already risen and the cut has closed to one.
  // The second never climbs, and the finished tread line reads 158 · 158 · 157 ·
  // 157 · 158 with stairs on the outer four: a slot you walk into.
  //
  // The trigger is deliberately **not** a cut. A column pinched between two
  // lifted columns that both stand above it is not climbing towards anything —
  // it is filling a hole in a step the pass itself made — so it is allowed to
  // rise on alignment alone, under exactly the same guards as the climb, and
  // never past {@link MAX_JUNCTION_LIFT}.
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let changed = false;
    const next = Int32Array.from(top);
    const lifted0 = Int32Array.from(lift);
    for (let z = 0; z < region.depth; z++) {
      for (let x = 0; x < region.width; x++) {
        const idx = z * region.width + x;
        if (movable[idx] !== 1) continue;
        if ((lift[idx] as number) >= MAX_JUNCTION_LIFT) continue;
        if (!isNotch(region, top, lift, x, z)) continue;
        if (wouldStrand(region, top, movable, lifted0, x, z)) continue;
        if (wouldBeCauseway(region, top, x, z)) continue;
        next[idx] = (top[idx] as number) + 1;
        lift[idx] = (lift[idx] as number) + 1;
        changed = true;
      }
    }
    top.set(next);
    if (!changed) break;
  }

  /* --- refusal: a seam, not a slope --------------------------------------- */
  //
  // **Kai's 2026-08-08 A/B walk of `c1-harbourtown`, defect B**, and the reason
  // this pass needs a scale rule at all. Every guard above is *local*: it asks
  // whether one column may rise, and a hillside is a place where the answer is
  // yes for hundreds of them in a row. What comes out is not a reconciled seam,
  // it is a natural gradient flooded with stairs — "a wide cascade of
  // mossy-cobble steps terracing an entire waterfront slope down to a dock".
  //
  // So the lift is grouped into connected patches and each patch is judged as a
  // whole against {@link MAX_SEAM_THICKNESS} and {@link MAX_SEAM_COLUMNS}. A
  // patch that fails is put back exactly where it started, and whatever cut it
  // was covering goes back to being a cut — reported through
  // {@link JunctionStepResult.refused} and, where it cannot be dressed as a
  // step, counted in `undressedCutoffs` by the audit. That is the honest
  // outcome: a bare face the ledger can see beats a terrace this pass has no
  // plan for.
  const refusal = refuseSlopes(region, top, standing, lift);

  /* --- apply: the plan first, then the tread ------------------------------ */

  const stairName = roleBlockName(input.palette, "ground.stairs", "stone_brick_stairs", stack);
  const blocks: StructureBlock[] = [];
  const steps: JunctionStep[] = [];
  let lifted = 0;
  let nosed = 0;
  let unresolved = 0;
  let backless = 0;
  let stoopLifts = 0;
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
        // **The 2026-08-07 defect, measured off the finished grid.** Read as a
        // property of the output rather than as a flag the skip above sets, so
        // it is a detector and not a restatement of the fix: a column that
        // climbed, and whose only paving at or above the level it climbed to is
        // a doorstep. Nothing it now stands beside is anything a walker was
        // trying to reach — the door is served along its own flight, whose foot
        // is at lane level a column on — so the lift bought a hump in the
        // pavement and a stair turned across the way in. Zero is the bar.
        if (onlyStoopAbove(region, paved, threshold, top, x, z, after)) stoopLifts++;
      }

      // A column whose top course already carries a dressing block — a flight's
      // own tread — is dressed where it stands, and re-laying it would swap one
      // stair for another while moving a denominator the audit pins.
      const alreadyDressed = occupied[idx] === 2;
      // The tread, laid *into* the top course. `street-stairs.ts` lays a
      // flight's mix the same way and for the same reason: a dressing block on
      // top of the surface is a block standing on the pavement, which is a
      // different defect in the same audit.
      const candidate = alreadyDressed
        ? undefined
        : stepFacing(region, top, built, x, z, after, highest);
      // **A stair that connects nothing is not dressing** (Kai's 2026-08-08
      // walk, defect 3: "random useless stairs — a stair block sunk in a pit in
      // otherwise flat pavement"). Only a `"step"` is laid now. The two shapes
      // that go are:
      //
      // - the **kerb**, this pass's own invention: a stair at the *foot* of a
      //   face two or more blocks tall. A nosing is architecture on the side you
      //   look over — the top of the wall — and this pass only ever dresses the
      //   low side, so every kerb it laid was a stair standing in flat pavement
      //   with an unclimbable wall in front of it, which is precisely the block
      //   Kai walked. `emit/dressing.ts`' `sunkenStairs` counts it off the
      //   finished world: 16 on the steep fixture, 241 on harbourtown with the
      //   gate forced on, and every one of them was a kerb or a backless tread.
      // - the **backless** tread, which the module note already called residue
      //   and which now simply is not laid.
      //
      // The cut underneath is not hidden by the refusal: it stays in
      // {@link JunctionStepResult.unresolved} and the audit counts it in
      // `undressedCutoffs`. A bare riser the ledger can see is a better world
      // than a stair that lies about being a way up.
      //
      // …and a step is only dressed where it is **between two pieces of
      // paving**. A tread with paving on neither side of its own axis is
      // dressing laid into natural ground: not a seam being closed, a hill
      // being terraced, which is `layout/levels.ts`' job. (`strandedTreads`.)
      const dressing =
        candidate === undefined || candidate.kind !== "step"
          ? undefined
          : pavedOnAxis(region, paved, x, z, candidate.facing)
            ? candidate
            : undefined;
      const state =
        dressing === undefined
          ? undefined
          : stack.blockStateOf(stairName, {
              facing: dressing.facing,
              half: "bottom",
              shape: "straight",
              waterlogged: "false",
            });
      if (state !== undefined) {
        blocks.push({ x: region.x0 + x, y: after, z: region.z0 + z, stateId: state });
        if (rise === 0) nosed++;
        if (dressing?.kind === "backless") backless++;
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
    backless,
    stoopLifts,
    refused: refusal.columns,
    refusedPatches: refusal.patches,
    largestSeam: refusal.largestKept,
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

/**
 * True when a column is a **notch**: pinched on one axis between two columns
 * this pass lifted, both of which now stand above it.
 *
 * Read on an axis rather than over the four neighbours because that is the shape
 * of the defect — a tread line runs along the seam, and a hole in it is a column
 * with the line on either side of it and open ground front and back.
 */
function isNotch(region: Region, top: Int32Array, lift: Int32Array, x: number, z: number): boolean {
  const here = top[z * region.width + x] as number;
  for (const [dx, dz] of [
    [1, 0],
    [0, 1],
  ] as const) {
    if (
      reachesLiftedAbove(region, top, lift, x, z, dx, dz, here) &&
      reachesLiftedAbove(region, top, lift, x, z, -dx, -dz, here)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * How wide a hole in a tread line still counts as a notch.
 *
 * Three, and it is the same three as everywhere else in this module: a gap
 * wider than the tallest step the pass can build is not a notch in a line, it is
 * a stretch of the line that never formed, and filling it would be climbing
 * rather than aligning. Measured on `site-plan-hillside-steep`, the walked jog
 * at `(62 … 63, 12)` is **two** columns wide, so a one-column rule — which is
 * what this was on its first cut — leaves the defect exactly where it was.
 */
const NOTCH_SPAN = MAX_JUNCTION_LIFT;

/**
 * True when walking one way along an axis reaches a column this pass lifted that
 * stands above `here`, without climbing over anything on the way.
 */
function reachesLiftedAbove(
  region: Region,
  top: Int32Array,
  lift: Int32Array,
  x: number,
  z: number,
  dx: number,
  dz: number,
  here: number,
): boolean {
  for (let step = 1; step <= NOTCH_SPAN; step++) {
    const nx = x + step * dx;
    const nz = z + step * dz;
    if (nx < 0 || nz < 0 || nx >= region.width || nz >= region.depth) return false;
    const nidx = nz * region.width + nx;
    if ((top[nidx] as number) > here) return (lift[nidx] as number) >= 1;
    // Level with the hole, or below it: still inside the hole, keep looking.
  }
  return false;
}

/** What {@link refuseSlopes} put back. */
interface Refusal {
  /** Columns whose lift was withdrawn. */
  readonly columns: number;
  /** Patches refused. */
  readonly patches: number;
  /** The largest patch the pass kept, in columns. */
  readonly largestKept: number;
}

/**
 * Group the lift into connected patches and put back every patch that is a
 * slope rather than a seam. Mutates `top` and `lift` in place.
 *
 * Eight-connected, because a terrace steps diagonally as often as it steps
 * square and splitting the diagonals would hide the very shape this refuses.
 */
function refuseSlopes(
  region: Region,
  top: Int32Array,
  standing: Int32Array,
  lift: Int32Array,
): Refusal {
  const cells = region.width * region.depth;
  const seen = new Uint8Array(cells);
  const stack: number[] = [];
  let columns = 0;
  let patches = 0;
  let largestKept = 0;
  for (let start = 0; start < cells; start++) {
    if (seen[start] === 1 || (lift[start] as number) < 1) continue;
    seen[start] = 1;
    stack.length = 0;
    stack.push(start);
    const patch: number[] = [];
    let x0 = region.width;
    let x1 = -1;
    let z0 = region.depth;
    let z1 = -1;
    while (stack.length > 0) {
      const idx = stack.pop() as number;
      patch.push(idx);
      const x = idx % region.width;
      const z = (idx - x) / region.width;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
      for (const [dx, dz] of NEIGHBOURS8) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= region.width || nz >= region.depth) continue;
        const nidx = nz * region.width + nx;
        if (seen[nidx] === 1 || (lift[nidx] as number) < 1) continue;
        seen[nidx] = 1;
        stack.push(nidx);
      }
    }
    const longest = Math.max(x1 - x0 + 1, z1 - z0 + 1);
    const thickness = patch.length / longest;
    if (thickness <= MAX_SEAM_THICKNESS && patch.length <= MAX_SEAM_COLUMNS) {
      if (patch.length > largestKept) largestKept = patch.length;
      continue;
    }
    patches++;
    columns += patch.length;
    for (const idx of patch) {
      lift[idx] = 0;
      top[idx] = standing[idx] as number;
    }
  }
  return { columns, patches, largestKept };
}

/** The highest paved neighbour of a column, and the way to it. */
function highestNeighbour(
  region: Region,
  paved: Uint8Array,
  top: Int32Array,
  x: number,
  z: number,
  skip?: Uint8Array,
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
    // `skip` names a *kind* of paving this question does not count — the
    // doorsteps, when the question is "is there a climb here to earn".
    if (skip !== undefined && skip[nidx] === 1) continue;
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
): { readonly mask: Uint8Array; readonly standing: Int32Array; readonly built: Uint8Array } {
  const { region, plan, stack } = input;
  const cells = region.width * region.depth;
  const mask = new Uint8Array(cells);
  /**
   * **1 where an unpaved column carries masonry.** A wall is not a surface: a
   * step that hands a walker "up" onto the foot of a cottage hands them into it.
   * The pass's own model cannot tell — `top` for an unclaimed column is the
   * plan's ground, and the plan's ground under a house is the floor it stands
   * on — so the block list is asked instead. Measured on both hillside fixtures
   * this is the whole residue of `blindStairs`: three lane treads on the steep
   * document and four on the hillside, every one of them turned at the base of a
   * building wall beside a doorstep.
   */
  const built = new Uint8Array(cells);
  const standing = Int32Array.from(plan.ground);
  /** `idx → y → block`, for the paved columns only. */
  const above = new Map<number, Map<number, number>>();
  for (const block of input.blocks) {
    const x = block.x - region.x0;
    const z = block.z - region.z0;
    if (x < 0 || z < 0 || x >= region.width || z >= region.depth) continue;
    const idx = z * region.width + x;
    if (paved[idx] !== 1) {
      if (block.y > (plan.ground[idx] as number)) built[idx] = 1;
      continue;
    }
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
  return { mask, standing, built };
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
 * True when the only paving at or above a lifted column's finished level is a
 * **doorstep** — the shape of the 2026-08-07 walk defect.
 *
 * Eight-connected, to match the neighbourhood the cut itself is measured in.
 * The test is deliberately "at or above" rather than "two or more above": a
 * lift that has already closed the gap to one still has to have been *for*
 * something, and if the only thing it now stands level with is a stoop, it was
 * not. A column that climbed towards a street, a flight, a plaza or a bank has
 * that neighbour above it at the end and is not counted, which is why this can
 * be read off the finished grid instead of trusting the rule that produced it.
 */
function onlyStoopAbove(
  region: Region,
  paved: Uint8Array,
  threshold: Uint8Array,
  top: Int32Array,
  x: number,
  z: number,
  after: number,
): boolean {
  let stoop = false;
  for (const [dx, dz] of NEIGHBOURS8) {
    const nx = x + dx;
    const nz = z + dz;
    if (nx < 0 || nz < 0 || nx >= region.width || nz >= region.depth) continue;
    const nidx = nz * region.width + nx;
    if (paved[nidx] !== 1) continue;
    if ((top[nidx] as number) < after) continue;
    if (threshold[nidx] !== 1) return false;
    stoop = true;
  }
  return stoop;
}

/**
 * True when the column in front of a tread, or the one behind it, is paving.
 *
 * The axis, not the neighbourhood: a tread is a piece of *connection*, and the
 * connection it makes runs along its own facing. Paving on the side of it is a
 * different street going past.
 */
function pavedOnAxis(
  region: Region,
  paved: Uint8Array,
  x: number,
  z: number,
  facing: string,
): boolean {
  const [dx, dz] = facing === "east" ? [1, 0] : facing === "west" ? [-1, 0] : facing === "south" ? [0, 1] : [0, -1];
  for (const sign of [1, -1] as const) {
    const nx = x + sign * (dx as number);
    const nz = z + sign * (dz as number);
    if (nx < 0 || nz < 0 || nx >= region.width || nz >= region.depth) continue;
    if (paved[nz * region.width + nx] === 1) return true;
  }
  return false;
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

/**
 * Which way a dressed step faces, and what that facing is *for*.
 *
 * There are exactly two honest things a stair at a junction can be, and the
 * facing has to name one of them:
 *
 * - **a step you climb** — a cardinal neighbour exactly one block above, which
 *   the stair's half-height half hands you up onto. `"step"`.
 * - **a nosing on a kerb** — a cardinal neighbour two or more above, a face the
 *   column cannot climb; the stair's full-height half stands against it and
 *   the edge reads as deliberate masonry rather than a sawn-off block. `"kerb"`.
 *
 * What it must never be is a stair **turned across everything it touches**:
 * full-height half against a column at its own level or below, half-height half
 * against nothing. Kai walked exactly that on 2026-08-07 — a lifted lane column
 * beside a doorstep, facing east into a column level with it, reading as a
 * second staircase built sideways next to the door's own. That outcome is
 * `"backless"`, it is counted ({@link JunctionStepResult.backless}), and zero is
 * the bar.
 *
 * The `"backless"` case is still *dressed*: the audit counts an undressed cut
 * whatever the reason, so refusing to lay the tread would trade a bad stair for
 * a bare riser. It falls back to the old rule — the axis of the diagonal that
 * cut it — and is reported instead of hidden.
 */
function stepFacing(
  region: Region,
  top: Int32Array,
  built: Uint8Array,
  x: number,
  z: number,
  after: number,
  highest: { readonly dx: number; readonly dz: number },
): { readonly facing: string; readonly kind: "step" | "kerb" | "backless" } {
  let step: readonly [number, number] | undefined;
  let kerb: readonly [number, number] | undefined;
  let kerbY = Number.NEGATIVE_INFINITY;
  for (const [dx, dz] of NEIGHBOURS4) {
    const nx = x + dx;
    const nz = z + dz;
    if (nx < 0 || nz < 0 || nx >= region.width || nz >= region.depth) continue;
    const nidx = nz * region.width + nx;
    // …except a **wall**: an unclaimed column with masonry standing on it is
    // the side of a building, and a step turned at one hands a walker into a
    // house. `emit/dressing.ts`' `blindStairs` counts what this clause removes.
    if (built[nidx] === 1) continue;
    // **Every** other neighbour, paved or not. What a stair's raised half stands
    // against is a question about the ground, and an unclaimed bank a block up
    // is as real a thing to step onto — and two blocks up as real a thing to
    // nose against — as a street is. Reading only the paving is what left a
    // third of these stairs turned at a bank they were built beside.
    const dy = (top[nidx] as number) - after;
    // Deterministic without a tie-break rule: `NEIGHBOURS4` is a fixed order and
    // the first neighbour at exactly one above wins. Every such neighbour is
    // the same connection from the stair's point of view.
    if (dy === 1) {
      step ??= [dx, dz] as const;
      continue;
    }
    if (dy >= JUNCTION_CUT && (top[nidx] as number) > kerbY) {
      kerbY = top[nidx] as number;
      kerb = [dx, dz] as const;
    }
  }
  if (step !== undefined) return { facing: facingOf(step[0], step[1]), kind: "step" };
  if (kerb !== undefined) return { facing: facingOf(kerb[0], kerb[1]), kind: "kerb" };
  return { facing: facingOf(highest.dx, highest.dz), kind: "backless" };
}
