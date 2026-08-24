/**
 * **Road risers** — the stair dressing (`STAIR_DRESS`, Kai, 2026-08-23).
 *
 * ## What it is
 *
 * Under the pull verdict a steep street already *is* a staircase: the blend
 * writes a profile whose riser law holds — never more than one riser per
 * block where the pull is in charge — and the columns come out of the driver
 * as full-block steps. This pass walks the finished paving and swaps the top
 * course of every **honest one-block riser** for a stair block facing the
 * rise, so the step a walker's eye already reads as a stair is one underfoot
 * too. The n13 line ships those risers bare because `junction-steps.ts` is
 * named dead by both `GROUND_V1_FREEZE` and `ROAD_SOVEREIGN`; this is the
 * part of that pass that was never the defect, rebuilt without the part that
 * was.
 *
 * ## What it is not, and the three scars that say so
 *
 * `junction-steps.ts` was retired for *lifting* — a reconciliation pass that
 * moved ground was a grader wearing a mason's badge, and each of its walked
 * defects (2026-08-08) was it working outside its remit. This pass keeps the
 * scars as law and none of the machinery:
 *
 * 1. **No level moves.** The pass reads `plan.ground` and emits blocks; it
 *    writes no plan field, no claim, no mask. A riser it cannot dress it
 *    leaves — {@link RoadRiserResult.refused} is the ledger, and a bare
 *    riser the ledger can see beats a stair that lies about being a way up.
 * 2. **A stair is laid only where it is a step.** One block, exactly, to a
 *    paved neighbour — a column that also faces a deeper paved drop is a
 *    ledge, not a step, and stays bare (the kerb lesson: a tread at the foot
 *    of something unclimbable connects nothing).
 * 3. **No cascade is possible by construction**: with no lift there is no
 *    relaxation, no patch, no propagation — the pass dresses columns the
 *    pull field already chose and cannot invent a terrace of its own.
 *
 * ## The convention
 *
 * The stair goes in the **higher** column's top course, at `plan.ground`,
 * facing the ascent — the direction of the rise, never the direction of
 * travel (`street-stairs.ts` learnt that the hard way). From the low side a
 * walker takes two half-steps through the block and arrives at the high
 * column's own level; a whole cross-row of risers dresses into a stair row
 * because every column decides from its own neighbours. Emitted as structure
 * blocks over the finished terrain — the plan keeps its solid column, so the
 * heightmap, the biome pass and the fluid validator see the ground they
 * always saw — which is exactly how a flight's treads have always shipped.
 */

import type { Region } from "@terrainist/stdlib";
import type { PrismarineStack } from "../emit/prismarine.js";
import type { ColumnPlan } from "../terrain/columns.js";
import type { Palette } from "../terrain/palette.js";
import type { StructureBlock } from "./buildings.js";
import type { PavedSurface } from "./junction-steps.js";

/** Everything the dressing reads. It writes nothing but its return value. */
export interface RoadRiserInput {
  readonly region: Region;
  readonly plan: ColumnPlan;
  readonly stack: PrismarineStack;
  /** For the `ground.stairs` role; absent in unit tests, exactly as flights allow. */
  readonly palette?: Palette;
  /** Every paved surface, as the junction-steps slot assembles them. */
  readonly paved: readonly PavedSurface[];
  /** Deck columns — a bridge is never dressed and never counts as a low side. */
  readonly bridged: ReadonlySet<number>;
  /**
   * Blocks emitted so far. A column carrying masonry directly on its own
   * ground — a stoop's cheek, a balustrade post — keeps its full top course:
   * a stair under standing masonry is a hole in whatever stands there.
   */
  readonly blocks: readonly StructureBlock[];
}

/** What the dressing wrote, and the honest remainder. */
export interface RoadRiserResult {
  readonly blocks: readonly StructureBlock[];
  /** Riser columns dressed with a stair. */
  readonly dressed: number;
  /** Riser columns seen and left bare: ledges, crests, occupied columns. */
  readonly refused: number;
}

/** The cardinal neighbourhood, in the fixed order every tie-break reads. */
const NEIGHBOUR4: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/** The cardinal name of a unit step, for the stair's `facing`. */
function facingOf(dx: number, dz: number): string {
  if (dx > 0) return "east";
  if (dx < 0) return "west";
  return dz > 0 ? "south" : "north";
}

/**
 * The block name behind a ground role — the same resolution
 * `street-stairs.ts` does for a flight's own treads, kept private there and
 * here alike because the palette stores state ids and a stair has to be laid
 * facing the way the ground rises.
 */
function roleBlock(
  palette: Palette | undefined,
  role: string,
  fallback: string,
  stack: PrismarineStack,
): string {
  if (palette === undefined || !palette.has(role)) return fallback;
  return stack.blockNameByStateId(palette.state(role)) ?? fallback;
}

/** Which paved kinds may *carry* a stair. Everything paved may be climbed from. */
const DRESSABLE = new Set(["street", "road"]);

/**
 * Dress every honest one-block riser in the paved network with a stair.
 *
 * Deterministic: one ascending sweep over the plan's cells, a fixed
 * neighbour order, no randomness and no iteration — each column answers from
 * `plan.ground` alone, so the result is a pure function of the finished
 * levels.
 */
export function dressRoadRisers(input: RoadRiserInput): RoadRiserResult {
  const { region, plan, stack } = input;
  const cells = region.width * region.depth;

  // The two masks: what may carry a stair, and what counts as a place a
  // walker stands. A flight's own treads and a plaza dressed themselves; a
  // doorstep stacked its stoop; all of them are lows to climb from and none
  // of them is repainted here.
  const dressable = new Uint8Array(cells);
  const walkable = new Uint8Array(cells);
  for (const surface of input.paved) {
    const carries = DRESSABLE.has(surface.kind);
    for (const idx of surface.columns) {
      walkable[idx] = 1;
      if (carries) dressable[idx] = 1;
    }
  }
  for (const idx of input.bridged) {
    dressable[idx] = 0;
    walkable[idx] = 0;
  }

  // Standing masonry: anything emitted directly on a column's own ground.
  const occupied = new Uint8Array(cells);
  for (const b of input.blocks) {
    const x = b.x - region.x0;
    const z = b.z - region.z0;
    if (x < 0 || z < 0 || x >= region.width || z >= region.depth) continue;
    const idx = z * region.width + x;
    if (b.y === (plan.ground[idx] as number) + 1) occupied[idx] = 1;
  }

  // One stair state per cardinal, resolved once. `blockStateOf` may miss —
  // a stack without the block — and then the pass simply dresses nothing,
  // the same tolerance a flight's own treads extend.
  const name = roleBlock(input.palette, "ground.stairs", "stone_brick_stairs", stack);
  const states = new Map<string, number>();
  for (const [dx, dz] of NEIGHBOUR4) {
    const facing = facingOf(dx, dz);
    const state = stack.blockStateOf(name, {
      facing,
      half: "bottom",
      shape: "straight",
      waterlogged: "false",
    });
    if (state !== undefined) states.set(facing, state);
  }

  const blocks: StructureBlock[] = [];
  let dressed = 0;
  let refused = 0;

  for (let idx = 0; idx < cells; idx++) {
    if (dressable[idx] !== 1) continue;
    const y = plan.ground[idx] as number;
    // A flooded column keeps its course: a stair under water is a defect the
    // fluid validator would have to learn about, and a wet street is a deck's
    // business, already excluded above.
    if ((plan.fluidTop[idx] as number) > y) continue;

    const x = idx % region.width;
    const z = (idx / region.width) | 0;

    // The neighbourhood verdict, all four sides in one read: the lows this
    // column could be climbed from, and whether any paved side falls deeper.
    let lowMask = 0;
    let deep = false;
    for (let n = 0; n < 4; n++) {
      const [dx, dz] = NEIGHBOUR4[n] as readonly [number, number];
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= region.width || nz >= region.depth) continue;
      const nidx = nz * region.width + nx;
      if (walkable[nidx] !== 1) continue;
      const ny = plan.ground[nidx] as number;
      if (ny <= y - 2) deep = true;
      else if (ny === y - 1) lowMask |= 1 << n;
    }
    if (lowMask === 0) continue;

    // The three refusals, in the order of their scars: a ledge (rule 2), a
    // crest a single facing cannot serve (both x-lows or both z-lows), and a
    // column with masonry standing on it.
    if (deep || (lowMask & 0b0011) === 0b0011 || (lowMask & 0b1100) === 0b1100 || occupied[idx] === 1) {
      refused++;
      continue;
    }

    // The ascent, from the low side into this column. With two perpendicular
    // lows — an outer corner of a stepped bend — prefer the one whose
    // opposite side carries the walk onward at this column's own level or
    // higher; otherwise the fixed order decides, deterministically.
    let pick = -1;
    for (let n = 0; n < 4; n++) {
      if ((lowMask & (1 << n)) === 0) continue;
      if (pick < 0) pick = n;
      const [dx, dz] = NEIGHBOUR4[n] as readonly [number, number];
      const ox = x - dx;
      const oz = z - dz;
      if (ox < 0 || oz < 0 || ox >= region.width || oz >= region.depth) continue;
      const oidx = oz * region.width + ox;
      if (walkable[oidx] === 1 && (plan.ground[oidx] as number) >= y) {
        pick = n;
        break;
      }
    }
    const [ldx, ldz] = NEIGHBOUR4[pick] as readonly [number, number];
    // The facing is the direction of the rise: from the low neighbour in.
    const state = states.get(facingOf(-ldx, -ldz));
    if (state === undefined) continue;
    blocks.push({ x: region.x0 + x, y, z: region.z0 + z, stateId: state });
    dressed++;
  }

  return { blocks, dressed, refused };
}
