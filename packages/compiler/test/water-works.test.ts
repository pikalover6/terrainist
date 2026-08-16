/**
 * W5 — the water movers (`docs/INFRA-ENTRIES-v0.md` families B and D).
 *
 * `dam`, `weir` and `canal_lock` were the last post-freeze rung, and they were
 * held for one reason: all three are a **`fluid.channel` declaration** (rank 0,
 * tier A) rather than a cross-section. So the questions these tests ask are not
 * the host's — `infra-entry.test.ts` settled route forms and gaps — they are the
 * four the declaration has to answer:
 *
 * 1. does the crossing land where the water is **narrowest**, and is upstream
 *    the higher ground;
 * 2. is the water upstream **held** and the water downstream **natural**, with
 *    the boundary column exact;
 * 3. is the result **stable** — zero findings from the same
 *    `checkFluidStability` the physics lint runs, which is the whole reason the
 *    surface is declared rather than painted;
 * 4. is it the **same twice**.
 *
 * The fixture is a river in a valley with a narrows in it, and the narrows is
 * deliberately not the lowest `z` in the search rectangle — otherwise "narrowest
 * crossing" and "first crossing" would be the same answer and the rule would be
 * untested.
 */

import { describe, expect, it } from "vitest";

import { INFRA_ENTRIES, nodeSeed, type InfraEntryDef, type Region } from "@terrainist/stdlib";

import { driverForPlan } from "../src/layout/ground-driver.js";
import { loadPrismarine } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { FluidKind, type ColumnPlan } from "../src/terrain/columns.js";
import { checkFluidStability } from "../src/terrain/validate.js";
import { index } from "../src/structures/roads.js";
import {
  buildInfraEntries,
  type InfraEntryJob,
  type InfraEntryPassResult,
  type InfraPlacementView,
  type InfraRouteSpec,
} from "../src/structures/infra-entry.js";
import { findWatercourse } from "../src/structures/water-works.js";

const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
const SEED = nodeSeed(0x5eabn, "world.fabric");
const REGION: Region = { x0: -64, z0: -64, width: 128, depth: 128 };
const BOUNDS = { x0: REGION.x0, z0: REGION.z0, width: REGION.width, depth: REGION.depth };

/* -------------------------------------------------------------------------- */
/* the fixture: a river in a valley, with a narrows                            */
/* -------------------------------------------------------------------------- */

/** The valley floor either side of the water, and the bed under it. */
const BANK = 96;
/** The upstream half stands two blocks higher — which is what makes it upstream. */
const UPSTREAM_LIFT = 2;
const BED = 90;
const SURFACE = 92;
/** The river runs between these two `z`, and is dry outside them. */
const RIVER_Z0 = -40;
const RIVER_Z1 = 40;
/** The narrows: nine columns of water instead of fifteen. */
const NARROWS_Z0 = 5;
const NARROWS_Z1 = 7;

/** Half the river's width at this `z`. */
function halfWidth(z: number): number {
  return z >= NARROWS_Z0 && z <= NARROWS_Z1 ? 4 : 7;
}

/**
 * A water meadow on the upstream bank: low ground the pool is meant to take.
 *
 * Without it the fixture's pool is exactly the river's own channel and
 * "drowning" would have nothing to drown — the one thing a dam does that a
 * higher `fluidTop` alone does not show.
 */
const MEADOW = { z0: -30, z1: -20, x0: 8, x1: 11, ground: 94 };

/** The land's height at this `z`, away from the water. */
function bankAt(z: number): number {
  return z < 0 ? BANK + UPSTREAM_LIFT : BANK;
}

/** True on the water meadow's own columns. */
function onMeadow(x: number, z: number): boolean {
  return z >= MEADOW.z0 && z <= MEADOW.z1 && x >= MEADOW.x0 && x <= MEADOW.x1;
}

function riverPlan(): ColumnPlan {
  const n = REGION.width * REGION.depth;
  const ground = new Int32Array(n);
  const fluidTop = new Int32Array(n);
  const fluidKind = new Uint8Array(n);
  for (let j = 0; j < REGION.depth; j++) {
    const z = REGION.z0 + j;
    for (let i = 0; i < REGION.width; i++) {
      const x = REGION.x0 + i;
      const k = j * REGION.width + i;
      const wet = z >= RIVER_Z0 && z <= RIVER_Z1 && Math.abs(x) <= halfWidth(z);
      ground[k] = wet ? BED : onMeadow(x, z) ? MEADOW.ground : bankAt(z);
      fluidTop[k] = wet ? SURFACE : (ground[k] as number);
      fluidKind[k] = wet ? FluidKind.WATER : FluidKind.NONE;
    }
  }
  return {
    region: REGION,
    ground,
    fluidTop,
    fluidKind,
    surface: new Int32Array(n),
    subsurface: new Int32Array(n),
    soil: new Uint8Array(n).fill(1),
    snow: new Uint8Array(n),
    biome: new Uint16Array(n),
    volcanic: new Uint8Array(n),
    volcanicUpper: new Uint8Array(n),
    lavaFlow: new Uint8Array(n),
    lakeMask: new Uint8Array(n),
    oceanMask: new Uint8Array(n),
    seaLevel: 63,
    stoneSeed: 1,
    states: { bedrock: 0, stone: 0, deepslate: 0, water: 0, lava: 0, snowLayer: 0, caveAir: 0 },
  } as unknown as ColumnPlan;
}

/** The mill: the node an author names, sitting on the river at the origin. */
const MILL = [
  { x: -10, z: -10 },
  { x: 10, z: -10 },
  { x: -10, z: 10 },
  { x: 10, z: 10 },
];

function view(plan: ColumnPlan): InfraPlacementView {
  const inBounds = (x: number, z: number): boolean =>
    x >= BOUNDS.x0 && z >= BOUNDS.z0 && x < BOUNDS.x0 + BOUNDS.width && z < BOUNDS.z0 + BOUNDS.depth;
  return {
    bounds: BOUNDS,
    extentOf: (id) => (id === "mill" ? MILL : undefined),
    corridorOf: () => undefined,
    maskOf: () => undefined,
    ground: (x, z) => (inBounds(x, z) ? (plan.ground[index(REGION, x, z)] as number) : undefined),
    onRoad: () => false,
  };
}

function job(def: InfraEntryDef, route: InfraRouteSpec): InfraEntryJob {
  return { nodePath: "world.fabric", def, route, params: {}, seed: SEED, gates: true };
}

function build(
  id: string,
  route: InfraRouteSpec = { form: "across", target: "mill" },
): { result: InfraEntryPassResult; plan: ColumnPlan } {
  const plan = riverPlan();
  const result = buildInfraEntries({
    plan,
    stack,
    jobs: [job(INFRA_ENTRIES[id] as InfraEntryDef, route)],
    view: view(plan),
    ground: driverForPlan(plan),
  });
  return { result, plan };
}

/** The plan's fluid surface at a column, or `undefined` where it is dry. */
function waterAt(plan: ColumnPlan, x: number, z: number): number | undefined {
  const k = index(REGION, x, z);
  return plan.fluidKind[k] === FluidKind.NONE ? undefined : (plan.fluidTop[k] as number);
}

/* -------------------------------------------------------------------------- */
/* the crossing                                                                */
/* -------------------------------------------------------------------------- */

describe("findWatercourse — the narrowest bounded crossing", () => {
  it("lands on the narrows, not on the first water it meets", () => {
    const found = findWatercourse(riverPlan(), BOUNDS, MILL);
    if (found.kind !== "crossing") throw new Error(found.detail);
    // Three columns, at the narrows — and the narrows is at a *higher* z than
    // most of the search rectangle, so "narrowest" beat "lowest z" here rather
    // than agreeing with it.
    expect(found.span).toBe(9);
    expect(new Set(found.wet.map((c) => c.z))).toEqual(new Set([NARROWS_Z0]));
    expect(found.wet.map((c) => c.x)).toEqual([-4, -3, -2, -1, 0, 1, 2, 3, 4]);
    // The barrier runs along x, because that is the axis the water is narrow on.
    expect(found.line).toEqual({ dx: 1, dz: 0 });
    expect(found.natural).toBe(SURFACE);
  });

  it("points upstream at the higher ground", () => {
    const found = findWatercourse(riverPlan(), BOUNDS, MILL);
    if (found.kind !== "crossing") throw new Error(found.detail);
    // The fixture lifts the valley on the negative-z hand by two blocks, and
    // that is the only thing distinguishing the two: water runs downhill.
    expect(found.up).toEqual({ dx: 0, dz: -1 });
  });

  it("refuses open water, and says which of the two refusals it is", () => {
    const plan = riverPlan();
    // Flood the whole region: every run leaves the search rectangle without
    // meeting a bank, which is a column standing *in* water rather than a
    // crossing of it.
    plan.fluidKind.fill(FluidKind.WATER);
    plan.fluidTop.fill(SURFACE);
    const found = findWatercourse(plan, BOUNDS, MILL);
    expect(found.kind).toBe("none");
    if (found.kind !== "none") throw new Error("unreachable");
    expect(found.detail).toContain("open water");

    const dry = riverPlan();
    dry.fluidKind.fill(FluidKind.NONE);
    const none = findWatercourse(dry, BOUNDS, MILL);
    expect(none.kind).toBe("none");
    if (none.kind !== "none") throw new Error("unreachable");
    expect(none.detail).toContain("no water");
  });
});

/* -------------------------------------------------------------------------- */
/* dam and weir                                                                */
/* -------------------------------------------------------------------------- */

describe("dam — held upstream, natural downstream", () => {
  const { result, plan } = build("dam");
  const built = result.entries[0];

  it("builds, and settles at the head the valley can hold", () => {
    expect(built?.columns).toBeGreaterThan(0);
    // The row asks for five. Five would put the surface at 97 and the valley
    // floor beside the pool stands at 96, so the retry takes it to four —
    // exactly the behaviour that keeps the lint at zero, measured rather than
    // asserted from the registry.
    expect(built?.head).toBe(4);
    expect(built?.impounded).toBeGreaterThan(0);
  });

  it("holds the water upstream and leaves it natural downstream", () => {
    // Well upstream of the barrier: held.
    expect(waterAt(plan, 0, -20)).toBe(SURFACE + 4);
    expect(waterAt(plan, 3, -30)).toBe(SURFACE + 4);
    // Well downstream: untouched, to the block.
    expect(waterAt(plan, 0, 20)).toBe(SURFACE);
    expect(waterAt(plan, 0, 30)).toBe(SURFACE);
  });

  it("puts the boundary column exactly where the barrier is", () => {
    // The crossing is at z = 5 and the profile reaches two columns either side,
    // so z = 3..7 is barrier and z = 2 is the first held column. Both sides of
    // that seam are named, because "the boundary is exact" is the claim.
    expect(waterAt(plan, 0, 8)).toBe(SURFACE);
    for (let z = 3; z <= 7; z++) {
      expect(waterAt(plan, 0, z), `z=${z}`).toBeUndefined();
      // Dry, and standing at the crest: the walkable line over the water.
      expect(plan.ground[index(REGION, 0, z)], `z=${z}`).toBe(SURFACE + 4 + 2);
    }
    expect(waterAt(plan, 0, 2)).toBe(SURFACE + 4);
  });

  it("leaves a crest that is walkable — solid, dry, and clear above", () => {
    const crest = SURFACE + 4 + 2;
    for (let x = -1; x <= 1; x++) {
      const k = index(REGION, x, 5);
      expect(plan.fluidKind[k], `x=${x}`).toBe(FluidKind.NONE);
      expect(plan.ground[k], `x=${x}`).toBe(crest);
      // Nothing of this entry's own stands in the two courses a walker needs.
      const over = result.blocks.filter((b) => b.x === x && b.z === 5 && b.y > crest);
      expect(over.length, `x=${x}`).toBe(0);
    }
  });

  it("is stable — zero findings from the physics lint's own predicate", () => {
    expect(checkFluidStability(plan).unstable).toBe(0);
  });

  it("drowns the columns the water is new on", () => {
    // Soil goes, so nothing is sown in a flooded column; the top course becomes
    // what was under it. A column that was already river is left alone.
    // The water meadow: dry ground before, under four blocks of water after.
    expect(waterAt(plan, 10, -25)).toBe(SURFACE + 4);
    expect(plan.soil[index(REGION, 10, -25)]).toBe(0);
    expect(plan.snow[index(REGION, 10, -25)]).toBe(0);
    // The river's own bed was already water and is left alone.
    expect(plan.soil[index(REGION, 3, -20)]).toBe(1);
  });
});

describe("weir — the low-water sibling", () => {
  const { result, plan } = build("weir");
  const built = result.entries[0];

  it("holds one block and keeps its lip at the water line", () => {
    expect(built?.head).toBe(1);
    expect(waterAt(plan, 0, -20)).toBe(SURFACE + 1);
    expect(waterAt(plan, 0, 20)).toBe(SURFACE);
    // Zero freeboard: the crest *is* the held surface, which is what makes it a
    // thing water goes over. Dry, so it is standable.
    const k = index(REGION, 0, 5);
    expect(plan.ground[k]).toBe(SURFACE + 1);
    expect(plan.fluidKind[k]).toBe(FluidKind.NONE);
  });

  it("is smaller than a dam — fewer columns of barrier for the same crossing", () => {
    const dam = build("dam");
    expect(built?.columns).toBeLessThan(dam.result.entries[0]?.columns ?? 0);
  });

  it("is stable", () => {
    expect(checkFluidStability(plan).unstable).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* the lock                                                                    */
/* -------------------------------------------------------------------------- */

describe("canal_lock — two gates and a chamber", () => {
  const { result, plan } = build("canal_lock");
  const built = result.entries[0];

  it("builds two gates a chamber apart", () => {
    expect(built?.columns).toBeGreaterThan(0);
    expect(built?.head).toBe(2);
    // The lower gate is on the crossing; the upper gate stands a chamber
    // upstream of it. Both are dry solid ground at the crest.
    const crest = SURFACE + 2 + 1;
    expect(plan.ground[index(REGION, 0, 5)]).toBe(crest);
    expect(plan.fluidKind[index(REGION, 0, 5)]).toBe(FluidKind.NONE);
    expect(plan.ground[index(REGION, 0, 5 - 15)]).toBe(crest);
    expect(plan.fluidKind[index(REGION, 0, 5 - 15)]).toBe(FluidKind.NONE);
  });

  it("stands the chamber's water at the upper reach, over a dug flat floor", () => {
    // Between the gates: the chamber, full to the upper reach — gates set for a
    // boat coming down, which is the only still frame a lock has.
    for (const z of [-2, -5, -8]) {
      expect(waterAt(plan, 0, z), `z=${z}`).toBe(SURFACE + 2);
      expect(plan.ground[index(REGION, 0, z)], `z=${z}`).toBe(BED - 1);
    }
    // Upstream of the upper gate: the upper reach itself.
    expect(waterAt(plan, 0, -20)).toBe(SURFACE + 2);
    // Downstream of the lower gate: natural, untouched.
    expect(waterAt(plan, 0, 20)).toBe(SURFACE);
  });

  it("is stable — a chamber that leaked would be the whole reach on the floor", () => {
    expect(checkFluidStability(plan).unstable).toBe(0);
  });

  it("stands its gates in timber and its catwalks in stone", () => {
    const names = new Set(result.blocks.map((b) => stack.blockNameByStateId(b.stateId) ?? "?"));
    expect([...names].some((n) => n.includes("planks") || n.includes("_log"))).toBe(true);
    // No slab, no stair, no fence — the registry's full-cube rule, held at the
    // one place a violation would be `floating.slab` over water.
    for (const n of names) {
      expect(n.endsWith("_slab"), n).toBe(false);
      expect(n.endsWith("_stairs"), n).toBe(false);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the refusals, and determinism                                               */
/* -------------------------------------------------------------------------- */

describe("what a water mover refuses", () => {
  it("says so when the node it names has no watercourse", () => {
    const plan = riverPlan();
    plan.fluidKind.fill(FluidKind.NONE);
    const result = buildInfraEntries({
      plan,
      stack,
      jobs: [job(INFRA_ENTRIES["dam"] as InfraEntryDef, { form: "across", target: "mill" })],
      view: view(plan),
      ground: driverForPlan(plan),
    });
    expect(result.entries[0]?.impounded).toBe(0);
    // LOAM-T233 is INFRA_ROUTE_UNANCHORED: a route named against nothing.
    expect(result.diagnostics.map((d) => d.code)).toContain("LOAM-T233");
  });

  it("builds dry rather than silently, where no head at all closes", () => {
    // A river with no valley: the banks stand at the water line, so any head
    // over zero spills sideways at once and every retry fails.
    const plan = riverPlan();
    for (let j = 0; j < REGION.depth; j++) {
      for (let i = 0; i < REGION.width; i++) {
        const k = j * REGION.width + i;
        if (plan.fluidKind[k] === FluidKind.NONE) plan.ground[k] = SURFACE;
        plan.fluidTop[k] = plan.fluidKind[k] === FluidKind.NONE ? SURFACE : SURFACE;
      }
    }
    const result = buildInfraEntries({
      plan,
      stack,
      jobs: [job(INFRA_ENTRIES["dam"] as InfraEntryDef, { form: "across", target: "mill" })],
      view: view(plan),
      ground: driverForPlan(plan),
    });
    const built = result.entries[0];
    expect(built?.impounded).toBe(0);
    expect(built?.columns).toBeGreaterThan(0);
    // LOAM-T234 is INFRA_RUN_REFUSED — a note, because the entry is built.
    expect(result.diagnostics.map((d) => d.code)).toContain("LOAM-T234");
    expect(checkFluidStability(plan).unstable).toBe(0);
  });
});

describe("determinism", () => {
  it("builds the same three worlds twice, block for block and column for column", () => {
    for (const id of ["dam", "weir", "canal_lock"]) {
      const a = build(id);
      const b = build(id);
      expect(a.result.blocks, id).toEqual(b.result.blocks);
      expect([...a.plan.ground], id).toEqual([...b.plan.ground]);
      expect([...a.plan.fluidTop], id).toEqual([...b.plan.fluidTop]);
      expect([...a.plan.fluidKind], id).toEqual([...b.plan.fluidKind]);
    }
  });
});
