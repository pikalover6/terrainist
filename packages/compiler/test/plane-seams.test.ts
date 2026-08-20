/**
 * **The plane edge** — `docs/GROUND-UNIFICATION-v0.md` Part V, wave 12D.
 *
 * R1 in one sentence: *every pass that levels ground to a plane owes the
 * boundary between that plane and the ground it did not level.* Inside a
 * quarter the platform election owes it (Part IV); outside one nobody did, and
 * that is why the pirate haven's quay — `QUAY_DEPTH` columns levelled to
 * `waterY + 1`, committing `transition: "ramp"` and promising in its own comment
 * to *"walk out to its own ground rather than ending at a cut face"* — ends at a
 * 4–6 block raw grass face over 73 columns (§11.0).
 *
 * What is proved here:
 *
 * 1. **R2, the adapter.** The edge is *measured* off the finished ground by
 *    `skirtSeams`' own construction — two-block floor, 8-connected grouping,
 *    median height — and handed to `buildTieredSeam` through a two-bench
 *    synthetic `GroundLevels`. Nothing about the seam machinery changes, which
 *    is why the section below can be asserted block for block.
 * 2. **R4, the cut side**: absorbed under `MIN_RETAIN_RUN`, one revetted course
 *    where `tierCountOf(drop) === 1` — 100 % of the walked evidence — and the
 *    hill's own rock past that, named by `LOAM-I417` so the mirror geometry
 *    lands on a number rather than on an anecdote. Never a ramp.
 * 3. **R6, reach.** `GROUND_PLANE_TIE` ships `false`, and a plane that says
 *    nothing is not measured at all: the world is the one that shipped. Every
 *    fixture here asks for the flag-on answer through `RetainingPlane.tiered`,
 *    exactly as `seam-tiers.test.ts` asks for it through `RetainingDistrict`'s —
 *    **the global flag is never flipped.**
 *
 * The controls §6 demands are here in both directions: the flag-off run is
 * byte-identical to a run with no planes at all (so "nothing moved" is a
 * measurement), and the flag-on run moves the ground (so the harness can see a
 * difference before it is trusted to have seen none).
 */

import { beforeAll, describe, expect, it } from "vitest";

import { MATERIAL_THEMES, nodeSeed, type MaterialTheme } from "@terrainist/stdlib";

import { loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import type { GroundClaim } from "../src/layout/ground-contract.js";
import { MIN_RETAIN_RUN, RETAIN_MAX, tierCountOf } from "../src/layout/levels.js";
import { GROUND_PLANE_TIE } from "../src/layout/types.js";
import type { Rect } from "../src/layout/frames.js";
import {
  buildRetainingWalls,
  finishCutFaces,
  type RetainingPlane,
} from "../src/structures/retaining.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import { defineGroundRoles, resolvePalette } from "../src/terrain/palette.js";

/* -------------------------------------------------------------------------- */
/* the fixture: a quay, and a hillside behind it                              */
/* -------------------------------------------------------------------------- */

const SIZE = 64;
const REGION = { x0: 0, z0: 0, width: SIZE, depth: SIZE } as const;
const at = (x: number, z: number): number => z * SIZE + x;

/** The quay's own level, and its frame. `QUAY_DEPTH`-ish, and its own width. */
const PLANE_Y = 64;
const PLANE_X0 = 4;
const PLANE_X1 = SIZE - 5;
const PLANE_Z0 = 20;
/** The **back** row of the plane — the row that meets the hill. */
const PLANE_Z1 = 26;
const PLANE_RUN = PLANE_X1 - PLANE_X0 + 1;

/** A dry plan of grass over dirt whose ground is whatever `height` says. */
function planOf(stack: PrismarineStack, height: (x: number, z: number) => number): ColumnPlan {
  const n = SIZE * SIZE;
  const grass = stack.blockByName("minecraft:grass_block")?.stateId ?? 0;
  const dirt = stack.blockByName("minecraft:dirt")?.stateId ?? 0;
  const ground = new Int32Array(n);
  for (let z = 0; z < SIZE; z++) for (let x = 0; x < SIZE; x++) ground[at(x, z)] = height(x, z);
  return {
    region: REGION,
    ground,
    fluidTop: Int32Array.from(ground),
    fluidKind: new Uint8Array(n),
    surface: new Int32Array(n).fill(grass),
    subsurface: new Int32Array(n).fill(dirt),
    soil: new Uint8Array(n).fill(3),
    snow: new Uint8Array(n),
    biome: new Uint16Array(n),
    volcanic: new Uint8Array(n),
    volcanicUpper: new Uint8Array(n),
    lavaFlow: new Uint8Array(n),
    lakeMask: new Uint8Array(n),
    oceanMask: new Uint8Array(n),
    seaLevel: 62,
    stoneSeed: 1,
    states: {
      bedrock: 0,
      stone: 0,
      deepslate: 0,
      water: stack.blockByName("minecraft:water")?.stateId ?? 0,
      lava: 0,
      snowLayer: 0,
      caveAir: 0,
    },
  } as unknown as ColumnPlan;
}

/** The quay's claims, exactly the shape `precincts.ts` records them in (12E). */
function quayColumns(): GroundClaim[] {
  const out: GroundClaim[] = [];
  for (let z = PLANE_Z0; z <= PLANE_Z1; z++) {
    for (let x = PLANE_X0; x <= PLANE_X1; x++) out.push({ idx: at(x, z), y: PLANE_Y });
  }
  return out;
}

const quay = (over: Partial<RetainingPlane> = {}): RetainingPlane => ({
  nodePath: "world.haven.quay",
  columns: quayColumns(),
  planeY: PLANE_Y,
  tiered: true,
  ...over,
});

/**
 * The walked case, as geometry: the quay is flat at `PLANE_Y`, the sea in front
 * of it is at the same level (so the fill side has nothing to answer and every
 * assertion here is about the cut side), and behind its back row the hillside
 * stands `face` blocks up.
 *
 * `patch`, when given, narrows the hill to those x columns — which is how a
 * *short* run is built without changing anything else.
 */
function hillside(face: number, patch?: readonly [number, number]) {
  return (x: number, z: number): number => {
    if (z <= PLANE_Z1) return PLANE_Y;
    if (patch !== undefined && (x < patch[0] || x > patch[1])) return PLANE_Y;
    return PLANE_Y + face;
  };
}

describe("wave 12D — a claimed plane owes its own edges", () => {
  let stack: PrismarineStack;
  beforeAll(() => {
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  });

  const themed = (): ReturnType<typeof resolvePalette>["palette"] => {
    const palette = resolvePalette(stack, undefined, nodeSeed(7n, "world")).palette;
    defineGroundRoles(palette, stack, MATERIAL_THEMES[1] as MaterialTheme);
    return palette;
  };

  const run = (
    height: (x: number, z: number) => number,
    planes: readonly RetainingPlane[],
    footprints: readonly Rect[] = [],
  ) => {
    const plan = planOf(stack, height);
    const result = buildRetainingWalls({
      districts: [],
      planes,
      plan,
      palette: themed(),
      stack,
      footprints,
    });
    return { result, plan };
  };

  /** The ground at a column of the plane's centre line, after the pass. */
  const groundAt = (plan: ColumnPlan, z: number): number => plan.ground[at(SIZE >> 1, z)] as number;

  /* --- R6: the flag, and the control -------------------------------------- */

  it("GROUND_PLANE_TIE ships true, and a plane must say so to go unmeasured", () => {
    expect(GROUND_PLANE_TIE).toBe(true);
    // Silence is the flag, and the flag is on: a plane that says nothing is
    // measured and served, exactly as one that asks for it by name.
    const quiet = run(hillside(5), [quay({ tiered: undefined })]);
    expect(quiet.result.planeEdges.planes).toBe(1);
    expect(quiet.result.blocks.length).toBeGreaterThan(0);
    expect(quiet.result.diagnostics.map((d) => d.code)).toContain("LOAM-I416");

    // The pre-flip control, inverted and kept: the untied world is still exactly
    // reachable — and it is still byte-identical to having no plane at all.
    const silent = run(hillside(5), [quay({ tiered: false })]);
    const none = run(hillside(5), []);
    expect(silent.result.planeEdges.planes).toBe(0);
    expect(silent.result.stacks).toBe(0);
    expect(silent.result.diagnostics).toHaveLength(0);
    // Byte-identity, measured rather than argued: the same fixture with no
    // planes at all is the same world, column for column and block for block.
    expect([...silent.plan.ground]).toEqual([...none.plan.ground]);
    expect([...silent.plan.subsurface]).toEqual([...none.plan.subsurface]);
    expect(silent.result.blocks).toEqual(none.result.blocks);
  });

  it("…and the harness can see a difference: flag-on, the same fixture moves", () => {
    const off = run(hillside(5), [quay({ tiered: false })]);
    const on = run(hillside(5), [quay()]);
    expect([...on.plan.ground]).not.toEqual([...off.plan.ground]);
    expect(on.result.blocks.length).toBeGreaterThan(0);
    expect(off.result.blocks).toHaveLength(0);
  });

  /* --- R4, the revetted course -------------------------------------------- */

  it("a 5-block cut face over the quay's run is one revetted course", () => {
    expect(tierCountOf(5)).toBe(1);
    expect(PLANE_RUN).toBeGreaterThanOrEqual(MIN_RETAIN_RUN);
    const { result } = run(hillside(5), [quay()]);
    expect(result.planeEdges.planes).toBe(1);
    expect(result.planeEdges.revetted).toBe(PLANE_RUN);
    expect(result.planeEdges.absorbed).toBe(0);
    expect(result.planeEdges.rock).toBe(0);
    expect(result.planeEdges.deferredFaces).toBe(0);
    expect(result.stacks).toBe(1);
    expect(result.stackTiers).toBe(1);
    expect(result.stacksByDressing.revetted).toBe(1);
    expect(result.stacksByDressing.terraced).toBe(0);
  });

  it("…and the section is exact: the course is the plane's own back row, and nothing more", () => {
    const { plan } = run(hillside(5), [quay()]);
    // One column of the plane, raised to the hill's own level — that is what a
    // revetment *is*, and `maxDist = 0` is why it costs exactly one column.
    expect(groundAt(plan, PLANE_Z1)).toBe(PLANE_Y + 5);
    // The plane keeps every other column of its width.
    expect(groundAt(plan, PLANE_Z1 - 1)).toBe(PLANE_Y);
    expect(groundAt(plan, PLANE_Z0)).toBe(PLANE_Y);
    // …and the hill behind it is untouched: a ramp on the cut side is a
    // post-materialisation cut of a hillside, which R4 refuses (§0.3a).
    expect(groundAt(plan, PLANE_Z1 + 1)).toBe(PLANE_Y + 5);
    expect(groundAt(plan, PLANE_Z1 + 4)).toBe(PLANE_Y + 5);
  });

  it("…the whole back row is served, end to end, and no column beyond it moved", () => {
    const { plan } = run(hillside(5), [quay()]);
    for (let x = PLANE_X0; x <= PLANE_X1; x++) {
      expect(plan.ground[at(x, PLANE_Z1)], `x ${x}`).toBe(PLANE_Y + 5);
    }
    // Outside the plane's own width the ground is what it always was.
    expect(plan.ground[at(PLANE_X0 - 1, PLANE_Z1)]).toBe(PLANE_Y);
    expect(plan.ground[at(PLANE_X1 + 1, PLANE_Z1)]).toBe(PLANE_Y);
  });

  it("…and the face lands in §13.8's histogram at its own drop, never past RETAIN_MAX", () => {
    const { result } = run(hillside(5), [quay()]);
    expect(result.facesByDrop[5]).toBeGreaterThan(0);
    for (let drop = RETAIN_MAX + 1; drop < result.facesByDrop.length; drop++) {
      expect(result.facesByDrop[drop]).toBe(0);
    }
  });

  it("every drop one course serves is revetted, and the drop above it is not", () => {
    for (let face = 2; face <= RETAIN_MAX; face++) {
      const { result } = run(hillside(face), [quay()]);
      expect(result.planeEdges.revetted, `face ${face}`).toBe(PLANE_RUN);
      expect(result.planeEdges.rock, `face ${face}`).toBe(0);
    }
    const over = run(hillside(RETAIN_MAX + 1), [quay()]);
    expect(over.result.planeEdges.revetted).toBe(0);
    expect(over.result.planeEdges.rock).toBe(PLANE_RUN);
  });

  /* --- R4, absorbed -------------------------------------------------------- */

  it("a face shorter than MIN_RETAIN_RUN is absorbed, and nothing is built", () => {
    const short = MIN_RETAIN_RUN - 3;
    const { result, plan } = run(hillside(2, [10, 10 + short - 1]), [quay()]);
    expect(result.planeEdges.absorbed).toBe(short);
    expect(result.planeEdges.revetted).toBe(0);
    expect(result.planeEdges.rock).toBe(0);
    expect(result.stacks).toBe(0);
    expect(result.blocks).toHaveLength(0);
    // S7's construction verbatim: the columns get no treatment of their own and
    // the plane is exactly the plane the precinct pass left.
    for (let x = 10; x < 10 + short; x++) {
      expect(plan.ground[at(x, PLANE_Z1)], `x ${x}`).toBe(PLANE_Y);
    }
  });

  it("…and the bar really is MIN_RETAIN_RUN: one column longer is served", () => {
    const one = run(hillside(2, [10, 10 + MIN_RETAIN_RUN - 2]), [quay()]);
    expect(one.result.planeEdges.absorbed).toBe(MIN_RETAIN_RUN - 1);
    expect(one.result.planeEdges.revetted).toBe(0);
    const two = run(hillside(2, [10, 10 + MIN_RETAIN_RUN - 1]), [quay()]);
    expect(two.result.planeEdges.absorbed).toBe(0);
    expect(two.result.planeEdges.revetted).toBe(MIN_RETAIN_RUN);
  });

  it("a one-block lip is not a face at all — `skirtSeams`' own two-block floor", () => {
    const { result } = run(hillside(1), [quay()]);
    expect(result.planeEdges.absorbed + result.planeEdges.revetted + result.planeEdges.rock).toBe(0);
    expect(result.planeEdges.planes).toBe(1);
    expect(result.blocks).toHaveLength(0);
  });

  /* --- R4, the rock deferral and LOAM-I417 --------------------------------- */

  it("a 9-block face is the hill's own rock, and LOAM-I417 says how deep", () => {
    expect(tierCountOf(9)).toBeGreaterThan(1);
    const { result, plan } = run(hillside(9), [quay()]);
    expect(result.planeEdges.rock).toBe(PLANE_RUN);
    expect(result.planeEdges.revetted).toBe(0);
    expect(result.planeEdges.deferredFaces).toBe(1);
    expect(result.planeEdges.deepestDeferred).toBe(9);
    // Nothing is built and no level moves.
    expect(result.stacks).toBe(0);
    expect(groundAt(plan, PLANE_Z1)).toBe(PLANE_Y);

    const deferred = result.diagnostics.find((d) => d.name === "PLANE_EDGE_DEFERRED");
    expect(deferred).toBeDefined();
    expect(deferred?.code).toBe("LOAM-I417");
    expect(deferred?.severity).toBe("note");
    expect(deferred?.message).toContain("1 cut face(s)");
    expect(deferred?.message).toContain("the deepest by 9 block(s)");
    expect(deferred?.message).toContain("the hill's own rock");
  });

  it("…and `finishCutFaces` is the pass that states what it is made of", () => {
    // The widened filter: districts **and** plane jobs. With the flag off the
    // plane is invisible to it, which is the byte-identity control.
    const plan = planOf(stack, hillside(9));
    const off = finishCutFaces({
      districts: [],
      planes: [quay({ tiered: false })],
      plan,
      palette: themed(),
      stack,
    });
    expect(off.revetted).toBe(0);
    const on = finishCutFaces({
      districts: [],
      planes: [quay()],
      plan,
      palette: themed(),
      stack,
    });
    expect(on.revetted).toBeGreaterThan(0);
  });

  /* --- R1's receipt -------------------------------------------------------- */

  it("LOAM-I416 reports once per plane, and names what its edges became", () => {
    const { result } = run(hillside(5), [quay()]);
    const served = result.diagnostics.filter((d) => d.name === "PLANE_EDGE_SERVED");
    expect(served).toHaveLength(1);
    expect(served[0]?.code).toBe("LOAM-I416");
    expect(served[0]?.severity).toBe("note");
    expect(served[0]?.nodePath).toBe("world.haven.quay");
    expect(served[0]?.message).toContain(`owes 1 cut edge(s), ${PLANE_RUN} column(s) in all`);
    expect(served[0]?.message).toContain(`${PLANE_RUN} revetted, 0 absorbed, 0 faced`);
  });

  it("…once per plane even when there is nothing to serve", () => {
    const { result } = run(hillside(0), [quay()]);
    const served = result.diagnostics.filter((d) => d.name === "PLANE_EDGE_SERVED");
    expect(served).toHaveLength(1);
    expect(served[0]?.message).toContain("nothing to serve on the cut side");
    expect(result.diagnostics.filter((d) => d.name === "PLANE_EDGE_DEFERRED")).toHaveLength(0);
  });

  it("…and two planes get two receipts", () => {
    const second: RetainingPlane = {
      nodePath: "world.haven.forecourt",
      columns: quayColumns().map((c) => ({ idx: c.idx, y: c.y })),
      planeY: PLANE_Y,
      tiered: true,
    };
    const { result } = run(hillside(5), [quay(), second]);
    expect(result.planeEdges.planes).toBe(2);
    expect(result.diagnostics.filter((d) => d.name === "PLANE_EDGE_SERVED")).toHaveLength(2);
  });

  /* --- S1's one honest refusal, asserted rather than assumed ---------------- */

  it("`buildTieredSeam` refuses to stand a course on a footprint, and says so", () => {
    // A warehouse standing along the whole back row of the quay: `open()` is
    // false for every column the course would have used, so the treatment was
    // chosen and could not be *placed* — which is the one refusal S1 leaves.
    const shed: Rect = { x0: PLANE_X0, z0: PLANE_Z1, x1: PLANE_X1, z1: PLANE_Z1 };
    const { result, plan } = run(hillside(5), [quay()], [shed]);
    expect(result.planeEdges.revetted).toBe(PLANE_RUN);
    expect(result.stackColumns).toBe(0);
    expect(result.blocks).toHaveLength(0);
    expect(groundAt(plan, PLANE_Z1)).toBe(PLANE_Y);
    const refused = result.diagnostics.find((d) => d.name === "SEAM_UNSERVED");
    expect(refused).toBeDefined();
    expect(refused?.severity).toBe("warning");
    expect(refused?.message).toContain("a revetted course");
  });

  /* --- R3: the fill side is the skirt, unchanged ---------------------------- */

  it("where the plane stands above the ground, its edge is an ordinary skirt", () => {
    // A quay standing six blocks proud of the shore in front of it and meeting
    // nothing behind: the fill half is exactly `skirtSeams`, taken by the
    // pass's own loop, so it is counted in `treated` and not in `planeEdges`.
    const shelf = (x: number, z: number): number =>
      z >= PLANE_Z0 && z <= PLANE_Z1 ? PLANE_Y : PLANE_Y - 6;
    const { result } = run(shelf, [quay()]);
    const treatedTotal = Object.values(result.treated).reduce((a, b) => a + b, 0);
    expect(treatedTotal).toBeGreaterThan(0);
    expect(result.walls + result.stacks + result.banks).toBeGreaterThan(0);
    // The cut side has nothing: the ground never stands over the plane.
    expect(result.planeEdges.revetted + result.planeEdges.rock).toBe(0);
  });

  /* --- determinism ---------------------------------------------------------- */

  it("is deterministic: the same plane twice is the same world", () => {
    const a = run(hillside(5), [quay()]);
    const b = run(hillside(5), [quay()]);
    expect([...a.plan.ground]).toEqual([...b.plan.ground]);
    expect([...a.plan.subsurface]).toEqual([...b.plan.subsurface]);
    expect([...a.plan.soil]).toEqual([...b.plan.soil]);
    expect(a.result.blocks).toEqual(b.result.blocks);
    expect(a.result.diagnostics.map((d) => d.message)).toEqual(
      b.result.diagnostics.map((d) => d.message),
    );
    // …and it does not depend on the order the claims arrive in: a plane is a
    // set of columns, and the grouping is region-order throughout.
    const shuffled = quay({ columns: [...quayColumns()].reverse() });
    const c = run(hillside(5), [shuffled]);
    expect([...c.plan.ground]).toEqual([...a.plan.ground]);
    expect(c.result.blocks).toEqual(a.result.blocks);
  });
});
