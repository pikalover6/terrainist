/**
 * `structures/junction-steps.ts` over synthetic column plans.
 *
 * The pass exists because the hillside fixtures showed **thirty-two undressed
 * cutoffs** — paved columns two or more blocks below the paving beside them,
 * with a bare vertical riser between. Those are measured in
 * `walkability.test.ts`, on real compiles, and they are the acceptance bar. What
 * they cannot show is *why* a given column moved, so everything about the
 * mechanism is asserted here instead, on plans small enough to read.
 *
 * Two of these tests are the ones the round was required to produce:
 *
 * - **the parallel-street control.** `docs/DESIGN.md` warned that pinning shared
 *   swept columns "can over-constrain a street running parallel to a wider one".
 *   That warning is about a different fix — this pass never pins — but it names
 *   the deformation to watch for, so it is watched for: a narrow lane running
 *   flush beside a wide avenue must come out of this pass with every column
 *   exactly where it went in.
 * - **the staircase**, which is Kai's ratified principle stated as an assertion:
 *   a connection earns its drop with run, so a three-block seam comes out as
 *   three columns rising one apiece, not one column rising three.
 */

import { describe, expect, it } from "vitest";

import type { Region } from "@terrainist/stdlib";

import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { loadPrismarine } from "../src/emit/prismarine.js";
import { FluidKind, type ColumnPlan } from "../src/terrain/columns.js";
import type { StructureBlock } from "../src/structures/buildings.js";
import {
  JUNCTION_CUT,
  MAX_JUNCTION_LIFT,
  MAX_SEAM_COLUMNS,
  MAX_SEAM_THICKNESS,
  buildJunctionStepsOnBarePlan,
  type PavedKind,
} from "../src/structures/junction-steps.js";

const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
const SEA = 63;

/* -------------------------------------------------------------------------- */
/* fixtures                                                                    */
/* -------------------------------------------------------------------------- */

function region(size = 32): Region {
  return { x0: 0, z0: 0, width: size, depth: size };
}

function plan(r: Region, height: (x: number, z: number) => number): ColumnPlan {
  const n = r.width * r.depth;
  const ground = new Int32Array(n);
  const fluidTop = new Int32Array(n);
  const surface = new Int32Array(n);
  const cobble = stack.blockByName("cobblestone")?.stateId ?? 1;
  for (let j = 0; j < r.depth; j++) {
    for (let i = 0; i < r.width; i++) {
      const k = j * r.width + i;
      ground[k] = height(r.x0 + i, r.z0 + j);
      fluidTop[k] = ground[k] as number;
      surface[k] = cobble;
    }
  }
  return {
    region: r,
    ground,
    fluidTop,
    fluidKind: new Uint8Array(n),
    surface,
    subsurface: new Int32Array(n),
    soil: new Uint8Array(n).fill(3),
    snow: new Uint8Array(n),
    biome: new Uint16Array(n),
    volcanic: new Uint8Array(n),
    volcanicUpper: new Uint8Array(n),
    lavaFlow: new Uint8Array(n),
    lakeMask: new Uint8Array(n),
    seaLevel: SEA,
    stoneSeed: 0,
    states: { bedrock: 0, stone: 0, deepslate: 0, water: 0, lava: 0, snowLayer: 0 },
  };
}

const at = (r: Region, x: number, z: number): number => (z - r.z0) * r.width + (x - r.x0);

/** Every column of a rectangle, as plan indices. */
function rect(r: Region, x0: number, z0: number, x1: number, z1: number): number[] {
  const out: number[] = [];
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) out.push(at(r, x, z));
  return out;
}

function run(
  p: ColumnPlan,
  paved: readonly { kind: PavedKind; columns: readonly number[] }[],
  blocks: readonly StructureBlock[] = [],
) {
  return buildJunctionStepsOnBarePlan({ region: p.region, plan: p, stack, paved, blocks });
}

/** The `y` of each column of a row, for readable assertions. */
function row(p: ColumnPlan, z: number, x0: number, x1: number): number[] {
  const out: number[] = [];
  for (let x = x0; x <= x1; x++) out.push(p.ground[at(p.region, x, z)] as number);
  return out;
}

/* -------------------------------------------------------------------------- */
/* the seam                                                                    */
/* -------------------------------------------------------------------------- */

describe("a seam between two paved surfaces at different levels", () => {
  /**
   * The shape the hillside fixtures actually show: a flat terrace street with a
   * higher street abutting it along a whole edge, sharing no column. `z <= 9` is
   * the high street at 80; `z >= 10` is the terrace at 77.
   */
  function seam(drop: number) {
    const r = region();
    const p = plan(r, (_x, z) => (z <= 9 ? 77 + drop : 77));
    const high = { kind: "street" as const, columns: rect(r, 4, 4, 20, 9) };
    const low = { kind: "street" as const, columns: rect(r, 4, 10, 20, 24) };
    return { r, p, high, low };
  }

  it("climbs the low side one block per column, and leaves the high side alone", () => {
    const { r, p, high, low } = seam(3);
    const result = run(p, [high, low]);

    // The staircase, read across the seam at an interior column: the one
    // against it arrives **one below** the street it meets — which is a step
    // you take, not a hole — and each one behind it is one lower again, down
    // to the terrace's own level.
    expect(row(p, 10, 12, 12)).toEqual([79]);
    expect(row(p, 11, 12, 12)).toEqual([78]);
    expect(row(p, 12, 12, 12)).toEqual([77]);
    expect(row(p, 13, 12, 12)).toEqual([77]);
    // …and it is a *run*, not a wall: two columns of run for a three-block
    // fall, because the top step is the junction itself. The two columns at
    // each end of the seam stop one short — the unclaimed bank beyond the
    // street's own edge cannot climb with them, and `wouldStrand` refuses to
    // deepen it. 15 interior columns rise two; 17 + 2 rise one.
    expect(result.liftHistogram).toEqual({ "1": 19, "2": 15 });
    // The high street never moves. A flight arrives at a street; a street does
    // not arrive at a flight, and the same asymmetry holds here.
    expect(row(p, 9, 4, 20).every((y) => y === 80)).toBe(true);
    expect(result.unresolved).toBe(0);
  });

  it("lays a stair into the top course of every column it touches", () => {
    const { r, p, low } = seam(3);
    const high = { kind: "street" as const, columns: rect(r, 4, 4, 20, 9) };
    const result = run(p, [high, low]);

    // The audit reads the block *under the walker's feet* — `nameAt(x, y − 1,
    // z)` — so the dressing has to be the top course itself, not a course laid
    // over it. Every emitted block sits at its own column's new ground.
    for (const block of result.blocks) {
      expect(block.y).toBe(p.ground[at(r, block.x, block.z)] as number);
      const decoded = stack.blockStateProps(block.stateId);
      expect(decoded?.name.endsWith("_stairs")).toBe(true);
      expect(decoded?.props["half"]).toBe("bottom");
      // Facing points uphill, never down: the stair's full-height half stands
      // against the climb. Where the only rise is diagonal — the corner at each
      // end of the seam — a stair has no diagonal facing to take, and the rule
      // weakens to "not downhill" rather than inventing a fifth direction.
      const facing = decoded?.props["facing"] as string;
      const [dx, dz] = ({ north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] } as const)[
        facing as "north"
      ];
      expect(p.ground[at(r, block.x + dx, block.z + dz)] as number).toBeGreaterThanOrEqual(block.y);
    }
    // Every column of the two-course run, **less the two corners**.
    //
    // 34 → 32 with the 2026-08-08 walk fixes. The two that went are the column
    // at each end of the staircase, where the run has turned the corner and the
    // only neighbour above is *diagonal*: those were the `backless` residue this
    // file used to pin at 2, dressed anyway on the argument that a bevel beats a
    // bare riser. Kai walked the result on `hillside_town_steep-6` as "random
    // useless stairs" and the argument does not survive it — a stair with
    // nothing one step up in front of it is not dressing, it is litter. They are
    // no longer laid; the cut under them is counted instead.
    expect(result.blocks.length).toBe(32);
  });

  it("stops at MAX_JUNCTION_LIFT and reports what it could not reach", () => {
    const { r, p, high, low } = seam(6);
    const result = run(p, [high, low]);
    expect(Math.max(...Object.keys(result.liftHistogram).map(Number))).toBe(MAX_JUNCTION_LIFT);
    // An interior seam column climbed as far as it is allowed — three — and is
    // still three below the street it meets.
    expect(p.ground[at(r, 12, 10)]).toBe(77 + MAX_JUNCTION_LIFT);
    // …and the run behind it is the full three columns, one block apiece.
    expect(row(p, 11, 12, 12)).toEqual([79]);
    expect(row(p, 12, 12, 12)).toEqual([78]);
    expect(row(p, 13, 12, 12)).toEqual([77]);
    // The worst rows are the ends of the seam, which `wouldStrand` held back.
    expect(result.worst[0]?.residual).toBe(6 - 1);
    // **0 → 17, and the change is the whole 2026-08-08 fix.** These seventeen
    // columns are the top of the run against a six-block face: they climbed
    // their three and the face still stands three above them. The pass used to
    // lay a "kerb" on each — a stair at the *foot* of a wall — and call the cut
    // settled. A nosing is architecture on the side you look over, and this pass
    // only ever dresses the low side, so every one of those was a stair standing
    // in pavement with an unclimbable wall in front of it. Kai walked exactly
    // that. The cut is now reported instead, and shows up honestly in the
    // audit's `undressedCutoffs`.
    expect(result.unresolved).toBe(17);
    expect(result.nosed).toBe(0);
  });

  it("does nothing at all where the two surfaces differ by one", () => {
    const { p, high, low } = seam(1);
    const before = Int32Array.from(p.ground);
    const result = run(p, [high, low]);
    expect(result.blocks).toHaveLength(0);
    expect(result.lifted).toBe(0);
    expect([...p.ground]).toEqual([...before]);
  });
});

/* -------------------------------------------------------------------------- */
/* the three rules Kai's 2026-08-08 walks bought                               */
/* -------------------------------------------------------------------------- */

describe("a slope is not a seam", () => {
  /**
   * The shape Kai walked on `c1-harbourtown` with the gate forced on: not two
   * finished surfaces meeting along a line, but **one continuous natural
   * gradient** with paving declared across the whole of it. Every column of it
   * is two below the column behind it, so every local rule in the pass says
   * "climb", and what comes out is the whole hillside terraced in stairs — "a
   * wide cascade of mossy-cobble steps terracing an entire waterfront slope down
   * to a dock".
   */
  it("refuses a whole patch of lift rather than terracing a gradient", () => {
    const r = region(48);
    // A 20 × 20 field of paving falling two blocks every two columns: a slope,
    // declared as one surface, with nothing to reconcile it *to*.
    const p = plan(r, (x, z) => 100 - 2 * Math.floor((x + z) / 3));
    const before = Int32Array.from(p.ground);
    const result = run(p, [{ kind: "street", columns: rect(r, 10, 10, 29, 29) }]);

    // Nothing moved, and the patch that wanted to move is reported as refused.
    expect([...p.ground]).toEqual([...before]);
    expect(result.lifted).toBe(0);
    expect(result.refused).toBeGreaterThan(MAX_SEAM_COLUMNS);
    expect(result.refusedPatches).toBe(1);
    // …and no stair is laid over a refusal: the cut goes to the ledger whole.
    expect(result.blocks).toHaveLength(0);
    expect(result.unresolved).toBeGreaterThan(0);
  });

  it("states the scale rule as numbers", () => {
    // A band that climbs three blocks is three columns wide; the fourth column
    // is the diagonal's, measured on harbourtown — see the module note.
    expect(MAX_SEAM_THICKNESS).toBe(MAX_JUNCTION_LIFT + 1);
    // Four times the widest junction this compiler lays.
    expect(MAX_SEAM_COLUMNS).toBe(64);
  });
});

describe("a tread line with a hole in it", () => {
  /**
   * **Kai's 2026-08-08 walk, defect 1** — "a recessed stair slot with a
   * one-block jog where treads misalign", measured at `(62 … 63, 12)` on
   * `site-plan-hillside-steep`.
   *
   * The relaxation is synchronous and every column asks its *own* neighbourhood
   * whether it is cut, so where the high side steps along its own run, one
   * column of the low side sees a two-block cut in round 0 and its neighbour
   * sees one in round 1 — by which time the first has risen and the cut has
   * closed to one. Built here as the smallest thing that reproduces it: a high
   * street whose level steps down partway along, so the low side's second row
   * climbs at one end and not at the other.
   */
  it("fills a gap left by the relaxation's own arithmetic", () => {
    const r = region();
    // The high side: 80 for x ≤ 11, then 79 — one step along its own run.
    const p = plan(r, (x, z) => (z <= 9 ? (x <= 11 ? 80 : 79) : 77));
    const high = { kind: "street" as const, columns: rect(r, 4, 4, 20, 9) };
    const low = { kind: "street" as const, columns: rect(r, 4, 10, 20, 24) };
    run(p, [high, low]);

    // The seam row is one continuous line, and so is the row behind it: no
    // column of either sits below both of its neighbours along the seam.
    for (const z of [10, 11] as const) {
      const line = row(p, z, 6, 18);
      for (let i = 1; i < line.length - 1; i++) {
        const dip =
          (line[i] as number) < (line[i - 1] as number) &&
          (line[i] as number) < (line[i + 1] as number);
        expect(dip, `notch at x=${6 + i}, z=${z} in ${line.join(",")}`).toBe(false);
      }
    }
  });
});

describe("a wall is not a surface", () => {
  /**
   * The residue the first cut of the 2026-08-08 fix left: `blindStairs` 3 on the
   * steep fixture and 4 on `site-plan-hillside`, every one a lane tread beside a
   * doorstep, turned at the **base of a cottage wall**. The pass's own model
   * cannot see it — `top` for an unclaimed column is the plan's ground, and the
   * plan's ground under a house is the floor it stands on — so a wall reads as a
   * neighbour one block up and a step gets turned at it. A step into a wall
   * hands a walker into somebody's front room.
   */
  it("never faces a tread at masonry standing on unclaimed ground", () => {
    const r = region();
    const p = plan(r, (_x, z) => (z <= 9 ? 79 : 77));
    const bricks = stack.blockByName("stone_bricks")?.stateId ?? 1;
    // A cottage wall on the unclaimed row at z = 9, standing on ground 79 — one
    // above the level the lane's own lift can reach.
    const laid: StructureBlock[] = [];
    for (let x = 4; x <= 20; x++) for (let y = 80; y <= 84; y++) laid.push({ x, y, z: 9, stateId: bricks });
    const result = run(p, [{ kind: "street", columns: rect(r, 4, 10, 20, 24) }], laid);

    for (const block of result.blocks) {
      const facing = stack.blockStateProps(block.stateId)?.props["facing"];
      expect(facing, `tread at ${block.x},${block.z} faces the wall`).not.toBe("north");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the control DESIGN.md asked for                                             */
/* -------------------------------------------------------------------------- */

describe("a narrow street running parallel to a wider one", () => {
  /**
   * The deformation `docs/DESIGN.md` warned about, built as flush as it can be:
   * a three-wide lane laid immediately beside a nine-wide avenue, sharing an
   * edge over their whole length, both graded to the same descending profile.
   * Pinning every shared swept column would drag one onto the other's stations;
   * this pass must leave both exactly as it found them.
   */
  it("is not deformed — every column comes out where it went in", () => {
    const r = region(48);
    // One gentle profile, one block of fall every four columns along x, shared
    // by both streets: they are parallel *and* level with each other.
    const p = plan(r, (x) => 80 - Math.floor(x / 4));
    const avenue = { kind: "street" as const, columns: rect(r, 4, 10, 40, 18) };
    const lane = { kind: "street" as const, columns: rect(r, 4, 19, 40, 21) };
    const before = Int32Array.from(p.ground);

    const result = run(p, [avenue, lane]);

    expect(result.lifted).toBe(0);
    expect(result.nosed).toBe(0);
    expect(result.blocks).toHaveLength(0);
    expect([...p.ground]).toEqual([...before]);
  });

  it("…and is still untouched when the wider one is a whole block above it", () => {
    // One block is the step a graded street takes by design. A lane running a
    // block below an avenue for forty columns is a kerb, not a defect, and a
    // pass that "fixed" it would have flattened the town.
    const r = region(48);
    const p = plan(r, (_x, z) => (z <= 18 ? 81 : 80));
    const avenue = { kind: "street" as const, columns: rect(r, 4, 10, 40, 18) };
    const lane = { kind: "street" as const, columns: rect(r, 4, 19, 40, 21) };
    const before = Int32Array.from(p.ground);

    const result = run(p, [avenue, lane]);

    expect(result.lifted).toBe(0);
    expect([...p.ground]).toEqual([...before]);
  });
});

/* -------------------------------------------------------------------------- */
/* what the pass refuses to move                                               */
/* -------------------------------------------------------------------------- */

describe("what a lift is not allowed to touch", () => {
  function cut(kind: PavedKind, blocks: readonly StructureBlock[] = []) {
    const r = region();
    const p = plan(r, (_x, z) => (z <= 9 ? 80 : 77));
    const high = { kind: "street" as const, columns: rect(r, 4, 4, 20, 9) };
    const low = { kind, columns: rect(r, 4, 10, 20, 24) };
    const before = Int32Array.from(p.ground);
    return { r, p, before, result: run(p, [high, low], blocks) };
  }

  it("never raises a doorstep: a threshold is at the level of its own door", () => {
    const { p, before, result } = cut("doorstep");
    expect(result.lifted).toBe(0);
    expect([...p.ground]).toEqual([...before]);
    // **The cut is reported, not dressed** (2026-08-08). A three-block face a
    // doorstep cannot climb has nothing a stair can do for it: the tread this
    // used to lay stood at the bottom of the wall facing into it. The pass now
    // says so — `unresolved` is the honest residue and `undressedCutoffs` in the
    // world audit is where a reader meets it.
    expect(result.nosed).toBe(0);
    expect(result.unresolved).toBeGreaterThan(0);
  });

  it("never raises a flight: its levels are the tread law's", () => {
    const { p, before, result } = cut("steps");
    expect(result.lifted).toBe(0);
    expect([...p.ground]).toEqual([...before]);
    expect(result.nosed).toBe(0);
    expect(result.unresolved).toBeGreaterThan(0);
  });

  it("never raises a column something already stands on", () => {
    const r = region();
    const post = stack.blockByName("cobblestone_wall")?.stateId ?? 1;
    // A lamp post on the column against the seam. Raising it would leave the
    // post buried in the step the pass just built under it.
    const standing: StructureBlock[] = [{ x: 12, y: 78, z: 10, stateId: post }];
    const { p, result } = cut("street", standing);
    expect(p.ground[at(r, 12, 10)]).toBe(77);
    // Its neighbour along the seam climbed, but only to within one of it: a
    // step whose own neighbour cannot follow would just move the cut sideways,
    // so the run stops one short of the frozen column and the staircase turns
    // the corner around it.
    expect(p.ground[at(r, 13, 10)]).toBe(78);
    expect(p.ground[at(r, 15, 10)]).toBe(79);
    expect(result.lifted).toBeGreaterThan(0);
  });

  it("never raises a deck over water", () => {
    const r = region();
    const p = plan(r, (_x, z) => (z <= 9 ? 80 : 77));
    for (const idx of rect(r, 4, 10, 20, 24)) p.fluidKind[idx] = FluidKind.WATER;
    const before = Int32Array.from(p.ground);
    const result = run(p, [
      { kind: "street", columns: rect(r, 4, 4, 20, 9) },
      { kind: "street", columns: rect(r, 4, 10, 20, 24) },
    ]);
    expect(result.lifted).toBe(0);
    expect([...p.ground]).toEqual([...before]);
  });
});

/* -------------------------------------------------------------------------- */
/* the two properties the pipeline depends on                                  */
/* -------------------------------------------------------------------------- */

describe("the pass as a function", () => {
  function hilly() {
    const r = region(40);
    // A staircase of terraces, so several seams exist at once and interact.
    const p = plan(r, (x, z) => 80 - 2 * Math.floor(z / 6) + (x > 20 ? 1 : 0));
    const paved = [
      { kind: "street" as const, columns: rect(r, 2, 2, 36, 12) },
      { kind: "road" as const, columns: rect(r, 2, 13, 36, 24) },
      { kind: "plaza" as const, columns: rect(r, 2, 25, 36, 36) },
    ];
    return { r, p, paved };
  }

  it("is deterministic: the same plan gives byte-identical levels and blocks", () => {
    const a = hilly();
    const b = hilly();
    const ra = run(a.p, a.paved);
    const rb = run(b.p, b.paved);
    expect([...a.p.ground]).toEqual([...b.p.ground]);
    expect(ra.blocks).toEqual(rb.blocks);
    expect(ra.liftHistogram).toEqual(rb.liftHistogram);
  });

  it("is idempotent: a second run over its own output moves nothing", () => {
    const { p, paved } = hilly();
    run(p, paved);
    const settled = Int32Array.from(p.ground);
    const again = run(p, paved);
    expect([...p.ground]).toEqual([...settled]);
    expect(again.lifted).toBe(0);
  });

  it("only ever raises ground, and never by more than the cap", () => {
    const { p, paved } = hilly();
    const before = Int32Array.from(p.ground);
    run(p, paved);
    for (let i = 0; i < before.length; i++) {
      const delta = (p.ground[i] as number) - (before[i] as number);
      expect(delta).toBeGreaterThanOrEqual(0);
      expect(delta).toBeLessThanOrEqual(MAX_JUNCTION_LIFT);
    }
  });

  it("states its own trigger as a number", () => {
    // One block is the step a graded street takes by design; two is a hole.
    // The audit's detector 2b uses the same bar, and it has to.
    expect(JUNCTION_CUT).toBe(2);
    // `walkability.ts`' LEVEL_SLACK: a lift past this and the audit's search
    // for the standing cell would fall outside the window round the declared
    // level, and the column would read as buried.
    expect(MAX_JUNCTION_LIFT).toBe(3);
  });
});

/* -------------------------------------------------------------------------- */
/* the doorstep defect Kai walked on 2026-08-07                                */
/* -------------------------------------------------------------------------- */

/**
 * The **standing surface** of a column: the plan's ground, plus the contiguous
 * stack of blocks laid on top of it.
 *
 * A doorstep does not move `plan.ground` — it *stacks masonry on it* — so this
 * is the only height at which a question about what a walker meets can be
 * asked, and it is the height the pass itself reconciles.
 */
function standingAt(
  p: ColumnPlan,
  blocks: readonly StructureBlock[],
  x: number,
  z: number,
): number {
  let y = p.ground[at(p.region, x, z)] as number;
  for (;;) {
    if (!blocks.some((b) => b.x === x && b.z === z && b.y === y + 1)) return y;
    y++;
  }
}

/**
 * **The detector, as a property of the finished world.**
 *
 * Every stair this pass lays has to be one of two honest things — a step you
 * climb, or a nosing against a face — and both mean the same thing about the
 * block: *the column its full-height half stands against is higher than it is*.
 * A stair whose facing points at a column level with it or below it is turned
 * across everything it touches, which is what Kai walked: a two-stair stack
 * beside a doorstep threshold, both treads facing sideways into a column at
 * their own level, reading as a second staircase the road built next to the
 * door's own.
 *
 * Asserted on every fixture in this file rather than only the doorstep one,
 * because the rule is not about doorsteps — it is about what a stair is.
 */
function expectEveryStairServesItsFacing(
  p: ColumnPlan,
  result: { readonly blocks: readonly StructureBlock[]; readonly backless: number },
  laid: readonly StructureBlock[] = [],
): void {
  const ways = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] } as const;
  for (const block of result.blocks) {
    const facing = stack.blockStateProps(block.stateId)?.props["facing"] as keyof typeof ways;
    const [dx, dz] = ways[facing];
    const height = standingAt(p, laid, block.x + dx, block.z + dz);
    expect(height, `stair at ${block.x},${block.y},${block.z} faces ${facing}`).toBeGreaterThan(
      block.y,
    );
  }
  expect(result.backless).toBe(0);
}

/**
 * The site, reduced to the geometry that produced it: a **flat** lane running
 * past a cottage, with the cottage's own doorstep flight stacked on two of the
 * lane's columns.
 *
 * On `site-plan-hillside` this is `(-80, -216)`: ground 176 for every column in
 * sight, a door at 179 whose flight lays a stair at 178 on an underpin at 177,
 * and a second stair at 177 one column out. `occupiedAbove` promotes those two
 * columns to the top of their masonry, so the lane beside them reads as two
 * blocks below "paving" — and the pass used to climb it, putting a hump in dead
 * flat pavement and dressing it facing the stoop. **Nothing here is a hill.**
 */
function stoop() {
  const r = region();
  // The cottage's own ground stands two above the lane at `z <= 9`, which is
  // what stops `wouldBeCauseway` from refusing the lift on its own: the pass
  // has to be *told* not to climb a stoop, not saved by an accident.
  const p = plan(r, (_x, z) => (z <= 9 ? 178 : 176));
  const andesite = stack.blockByName("polished_andesite")?.stateId ?? 1;
  const tread =
    stack.blockStateOf("stone_brick_stairs", {
      facing: "north",
      half: "bottom",
      shape: "straight",
      waterlogged: "false",
    }) ?? 1;
  // The doorstep flight: an underpin and a tread on the column at the door,
  // one tread on the column beyond it. Exactly what `doorsteps.ts` builds.
  const laid: StructureBlock[] = [
    { x: 12, y: 177, z: 10, stateId: andesite },
    { x: 12, y: 178, z: 10, stateId: tread },
    { x: 12, y: 177, z: 11, stateId: tread },
  ];
  const paved = [
    { kind: "street" as const, columns: rect(r, 4, 10, 20, 14) },
    { kind: "doorstep" as const, columns: [at(r, 12, 10), at(r, 12, 11)] },
  ];
  return { r, p, paved, laid };
}

describe("a lane running past a doorstep", () => {
  it("never climbs a stoop: the cheek of a step is not a cut to be earned", () => {
    const { p, paved, laid } = stoop();
    const before = Int32Array.from(p.ground);
    const result = run(p, paved, laid);

    // **The detector.** Before the 2026-08-07 fix this read 4 on this fixture,
    // 3 on `site-plan-hillside` and 2 on `site-plan-hillside-steep`: lane
    // columns raised with nothing but a doorstep at or above the level they
    // reached. A door is served *along* its own flight, whose foot is at lane
    // level a column further out; a walker never enters across the side of a
    // step, so the climb bought nothing but a hump.
    expect(result.stoopLifts).toBe(0);
    expect(result.lifted).toBe(0);
    // Dead flat, and it stays dead flat.
    expect([...p.ground]).toEqual([...before]);
  });

  it("…and reports the cheek as the cut it is, rather than dressing it", () => {
    const { p, paved, laid } = stoop();
    const result = run(p, paved, laid);
    // **Reversed on 2026-08-08, and the earlier reading was the defect.** This
    // used to insist the cheek be *nosed* so the audit would not count it. Kai
    // then walked the nosings — here and on both hillside fixtures — as
    // "random useless stairs": a stair block laid flat in the pavement at the
    // side of a stoop, pointing at a threshold two blocks up that nobody enters
    // sideways. The lane column beside the *lower* tread is one block down and
    // still gets its step (the test below); the one beside the upper tread is
    // two down, has no step to be, and is now simply reported.
    // The two treads that stay are the ones beside the flight's *lower* tread,
    // one either side of the door: each is one block under the stoop it faces,
    // which is a real way up onto it. `nosed` counts a tread laid on a column
    // that did not have to move, and both of these are that.
    expect(result.nosed).toBe(2);
    // The two that go are the ones beside the *upper* tread, two blocks under a
    // threshold nobody enters sideways. They are the cut now, not the dressing.
    expect(result.unresolved).toBe(2);
  });

  it("faces every tread it lays along the connection that tread serves", () => {
    const { p, paved, laid } = stoop();
    const result = run(p, paved, laid);
    expectEveryStairServesItsFacing(p, result, laid);
    // The two columns beside the flight are the ones Kai walked, and they come
    // out as **one** thing a junction stair is allowed to be, and one nothing.
    // Beside the flight's *lower* tread the rise is one block — a real way onto
    // the doorstep from the side — so that stair is a **step**, faces east, and
    // stays. Beside the *upper* tread the rise is two and unclimbable: that was
    // the "kerb", it is one of the blocks Kai walked, and since 2026-08-08 it is
    // not laid at all.
    const step = result.blocks.find((b) => b.x === 11 && b.z === 11);
    expect(stack.blockStateProps(step?.stateId ?? 0)?.props["facing"]).toBe("east");
    expect(standingAt(p, laid, 12, 11) - (step?.y ?? 0)).toBe(1);
    expect(result.blocks.find((b) => b.x === 11 && b.z === 10)).toBeUndefined();
  });

  it("holds the same rule on the seams, which are not doorsteps at all", () => {
    // The control: the property is about what a stair *is*, so a seam between
    // two ordinary streets has to satisfy it too, and a fix that bought the
    // doorstep case by weakening the seam case would show up here.
    const r = region();
    const p = plan(r, (_x, z) => (z <= 9 ? 80 : 77));
    const result = run(p, [
      { kind: "street", columns: rect(r, 4, 4, 20, 9) },
      { kind: "street", columns: rect(r, 4, 10, 20, 24) },
    ]);
    expect(result.stoopLifts).toBe(0);
    // **2 → 0, and the residue went by not being laid.** The two `backless`
    // treads were the ends of the staircase, where the run turns the corner and
    // the only neighbour above is *diagonal* — a stair has four facings and no
    // diagonal one, so there was no direction in which either could stand
    // against anything higher. This file used to pin them at 2 and call it the
    // lattice-corner artifact that MUST GO DOWN. It has: since 2026-08-08 the
    // pass lays a tread only where it is a step, so a block with nothing one
    // above it in any cardinal direction is never emitted, and `backless` is
    // structurally zero rather than merely small.
    expect(result.backless).toBe(0);
    expect(result.blocks).toHaveLength(32);
  });
});
