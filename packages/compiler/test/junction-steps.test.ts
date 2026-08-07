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
  buildJunctionSteps,
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
  return buildJunctionSteps({ region: p.region, plan: p, stack, paved, blocks });
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
    // Every column of the two-course run, and nothing else.
    expect(result.blocks.length).toBe(19 + 15);
  });

  it("stops at MAX_JUNCTION_LIFT and dresses what it could not reach", () => {
    const { r, p, high, low } = seam(6);
    const result = run(p, [high, low]);
    expect(Math.max(...Object.keys(result.liftHistogram).map(Number))).toBe(MAX_JUNCTION_LIFT);
    // An interior seam column climbed as far as it is allowed — three — and is
    // still three below the street it meets. It carries a stair anyway, which
    // is the honest half-answer this pass gives when the drop is bigger than a
    // run of steps can absorb: a nosed kerb, counted rather than hidden.
    expect(p.ground[at(r, 12, 10)]).toBe(77 + MAX_JUNCTION_LIFT);
    // …and the run behind it is the full three columns, one block apiece.
    expect(row(p, 11, 12, 12)).toEqual([79]);
    expect(row(p, 12, 12, 12)).toEqual([78]);
    expect(row(p, 13, 12, 12)).toEqual([77]);
    // The worst rows are the ends of the seam, which `wouldStrand` held back.
    expect(result.worst[0]?.residual).toBe(6 - 1);
    expect(result.unresolved).toBe(0);
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
    // It is still dressed where it stands, so the cut is not left raw.
    expect(result.nosed).toBeGreaterThan(0);
    expect(result.unresolved).toBe(0);
  });

  it("never raises a flight: its levels are the tread law's", () => {
    const { p, before, result } = cut("steps");
    expect(result.lifted).toBe(0);
    expect([...p.ground]).toEqual([...before]);
    expect(result.nosed).toBeGreaterThan(0);
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
