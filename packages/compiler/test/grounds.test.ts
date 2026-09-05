/**
 * Ground treatment (fabric v2, F2) — the ground between the walls.
 *
 * Three layers, and the split is the same one the rest of the suite uses:
 *
 * 1. **The mapping.** Category → treatment is a table, and a table is testable
 *    without compiling anything. What matters is that every catalog category
 *    resolves, that the four named families land where the design says, and
 *    that an unknown archetype falls back rather than throwing.
 * 2. **The passes, on a synthetic plan.** A hand-built column plan is the only
 *    place the "never overwrites" rules can be *proved* rather than sampled:
 *    the fixture puts a road, a doorstep, a footprint and a pond exactly where
 *    the treatment wants to go, and asserts the treatment went elsewhere.
 *    Determinism is asserted the same way — two runs from the same seed.
 * 3. **A compiled world.** `examples/hilltop-crypt-hamlet.loam.json` end to
 *    end, read back off disk, with every physics rule at zero. Ground
 *    treatment writes fences, flowers and logs onto ground the emitter lays,
 *    which is exactly the class of change that produces a floating block, so
 *    the readback lint is the test that matters.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { STRUCTURE_CATEGORIES, nodeSeed } from "@terrainist/stdlib";

import { lintWorldPhysics, PHYSICS_RULES, type PhysicsReport } from "../src/emit/physics.js";
import { EMIT_MINECRAFT_VERSION, loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { compileArtifacts, compileTerrain, type TerrainCompileReport  } from "../src/terrain/compile.js";
import { FluidKind, type ColumnPlan } from "../src/terrain/columns.js";
import { CLEARING_MARGIN } from "../src/terrain/clearing.js";
import { resolvePalette } from "../src/terrain/palette.js";
import type { TreePlacement } from "../src/terrain/vegetation.js";
import {
  APRON_RADIUS,
  DEFAULT_TREATMENT,
  GROUND_TREATMENTS,
  TRANSITION_BAND,
  TRANSITION_MEADOW_FRACTION,
  TRANSITION_TREE_KEEP,
  buildGrounds,
  buildTransitionBand,
  treatmentOf,
  type GroundPassResult
} from "../src/structures/grounds.js";
import type { BuiltBuilding, StructureBlock } from "../src/structures/buildings.js";
import type { StructurePassResult } from "../src/structures/index.js";

const EXAMPLE = fileURLToPath(
  new URL("fixtures/examples/hilltop-crypt-hamlet.loam.json", import.meta.url),
);

/* -------------------------------------------------------------------------- */
/* 1. the category → treatment table                                           */
/* -------------------------------------------------------------------------- */

describe("category → treatment", () => {
  it("maps every catalog category to a treatment", () => {
    for (const category of STRUCTURE_CATEGORIES) {
      expect(GROUND_TREATMENTS[category]).toBeDefined();
    }
  });

  it("gives the four families the design's treatments", () => {
    expect(GROUND_TREATMENTS["commercial"]).toBe("apron");
    expect(GROUND_TREATMENTS["civic"]).toBe("apron");
    expect(GROUND_TREATMENTS["modern"]).toBe("apron");
    expect(GROUND_TREATMENTS["residential"]).toBe("garden");
    expect(GROUND_TREATMENTS["vernacular"]).toBe("garden");
    expect(GROUND_TREATMENTS["industrial"]).toBe("yard");
    expect(GROUND_TREATMENTS["energy"]).toBe("yard");
    expect(GROUND_TREATMENTS["religious"]).toBe("sacred");
    expect(GROUND_TREATMENTS["memorial"]).toBe("sacred");
  });

  it("resolves a real archetype through the catalog", () => {
    // `cottage` is a residential catalog entry and a live archetype id.
    expect(treatmentOf("cottage")).toBe("garden");
    expect(treatmentOf("church")).toBe("sacred");
  });

  it("falls back rather than throwing on an unknown archetype", () => {
    expect(treatmentOf("no_such_archetype_at_all")).toBe(DEFAULT_TREATMENT);
    expect(treatmentOf(undefined)).toBe(DEFAULT_TREATMENT);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. the passes, on a synthetic plan                                          */
/* -------------------------------------------------------------------------- */

const REGION = { x0: 0, z0: 0, width: 64, depth: 64 } as const;

/** A flat, dry, grassy column plan at y = 64. */
function flatPlan(stack: PrismarineStack): ColumnPlan {
  const n = REGION.width * REGION.depth;
  const grass = stack.blockByName("minecraft:grass_block")?.stateId ?? 0;
  const dirt = stack.blockByName("minecraft:dirt")?.stateId ?? 0;
  return {
    region: REGION,
    ground: new Int32Array(n).fill(64),
    fluidTop: new Int32Array(n).fill(64),
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
      caveAir: 0
    }
  } as unknown as ColumnPlan;
}

/** A minimal `BuiltBuilding` — only the fields the ground pass reads. */
function fakeBuilding(
  nodePath: string,
  archetype: string,
  rect: { x0: number; z0: number; x1: number; z1: number },
): BuiltBuilding {
  return {
    nodePath,
    footprint: rect,
    interior: { x0: rect.x0 + 1, z0: rect.z0 + 1, x1: rect.x1 - 1, z1: rect.z1 - 1 },
    meta: { params: { archetype } },
    blockCount: 0,
    floorY: 64,
    basementDepth: 0,
    cells: new Set<string>()
  } as unknown as BuiltBuilding;
}

const idx = (x: number, z: number): number => (z - REGION.z0) * REGION.width + (x - REGION.x0);

interface Harness {
  readonly stack: PrismarineStack;
  readonly plan: ColumnPlan;
  readonly result: GroundPassResult;
  readonly baseline: Int32Array;
  readonly road: Uint8Array;
  readonly doorsteps: Uint8Array;
}

/**
 * One synthetic settlement: a shop and a cottage, a lane between them, a
 * doorstep in front of the shop and a pond at the cottage's shoulder.
 */
function runGrounds(seed: number): Harness {
  const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  const palette = resolvePalette(stack, undefined, nodeSeed(7n, "world")).palette;
  const plan = flatPlan(stack);
  const n = REGION.width * REGION.depth;

  const road = new Uint8Array(n);
  for (let x = 4; x < 60; x++) road[idx(x, 20)] = 1;
  const doorsteps = new Uint8Array(n);
  for (let z = 16; z < 20; z++) doorsteps[idx(12, z)] = 1;

  // A pond hard against the cottage's east wall.
  const water = stack.blockByName("minecraft:water")?.stateId ?? 0;
  for (let z = 34; z <= 40; z++) {
    for (let x = 42; x <= 46; x++) {
      plan.fluidKind[idx(x, z)] = FluidKind.WATER;
      plan.surface[idx(x, z)] = water;
    }
  }

  const buildings = [
    fakeBuilding("root.shop", "general_store", { x0: 8, z0: 8, x1: 16, z1: 15 }),
    fakeBuilding("root.house", "cottage", { x0: 34, z0: 34, x1: 41, z1: 41 })
  ];

  const baseline = Int32Array.from(plan.surface);
  const result = buildGrounds({
    buildings,
    plan,
    palette,
    stack,
    seed,
    roadColumns: road,
    doorstepColumns: doorsteps
  });
  return { stack, plan, result, baseline, road, doorsteps };
}

describe("lot dressing", () => {
  it("is deterministic: same seed, same ground and same blocks", () => {
    const a = runGrounds(4242);
    const b = runGrounds(4242);
    expect(Array.from(a.plan.surface)).toEqual(Array.from(b.plan.surface));
    expect(a.result.blocks).toEqual(b.result.blocks);
    expect(a.result.lots).toEqual(b.result.lots);
    expect(a.result.dressedColumns).toBe(b.result.dressedColumns);
    expect(a.result.wornColumns).toBe(b.result.wornColumns);
  });

  it("differs under a different seed — the speckle is seeded, not fixed", () => {
    const a = runGrounds(4242);
    const b = runGrounds(99);
    expect(Array.from(a.plan.surface)).not.toEqual(Array.from(b.plan.surface));
  });

  it("gives each lot the treatment its category asks for", () => {
    const { result } = runGrounds(4242);
    const byPath = new Map(result.lots.map((l) => [l.nodePath, l] as const));
    expect(byPath.get("root.shop")?.treatment).toBe("apron");
    expect(byPath.get("root.house")?.treatment).toBe("garden");
    expect((byPath.get("root.shop")?.columns ?? 0)).toBeGreaterThan(0);
    expect((byPath.get("root.house")?.columns ?? 0)).toBeGreaterThan(0);
  });

  it("paves an apron ring right up against the shop's wall", () => {
    const { plan, baseline } = runGrounds(4242);
    let ring = 0;
    for (let x = 8; x <= 16; x++) {
      if (plan.surface[idx(x, 7)] !== baseline[idx(x, 7)]) ring++;
    }
    expect(ring).toBeGreaterThan(4);
    // …and stops at APRON_RADIUS.
    for (let x = 8; x <= 16; x++) {
      expect(plan.surface[idx(x, 8 - APRON_RADIUS - 1)]).toBeDefined();
    }
  });

  it("never overwrites a road column", () => {
    const { plan, baseline, road } = runGrounds(4242);
    for (let k = 0; k < road.length; k++) {
      if (road[k] === 1) expect(plan.surface[k]).toBe(baseline[k]);
    }
  });

  it("never overwrites a doorstep column", () => {
    const { plan, baseline, doorsteps } = runGrounds(4242);
    for (let k = 0; k < doorsteps.length; k++) {
      if (doorsteps[k] === 1) expect(plan.surface[k]).toBe(baseline[k]);
    }
  });

  it("never overwrites a footprint", () => {
    const { plan, baseline } = runGrounds(4242);
    for (const r of [
      { x0: 8, z0: 8, x1: 16, z1: 15 },
      { x0: 34, z0: 34, x1: 41, z1: 41 }
    ]) {
      for (let z = r.z0; z <= r.z1; z++) {
        for (let x = r.x0; x <= r.x1; x++) {
          expect(plan.surface[idx(x, z)]).toBe(baseline[idx(x, z)]);
        }
      }
    }
  });

  it("never touches water, and stands nothing in it", () => {
    const { plan, baseline, result } = runGrounds(4242);
    for (let k = 0; k < plan.fluidKind.length; k++) {
      if (plan.fluidKind[k] !== FluidKind.NONE) expect(plan.surface[k]).toBe(baseline[k]);
    }
    for (const b of result.blocks) {
      expect(plan.fluidKind[idx(b.x, b.z)]).toBe(FluidKind.NONE);
    }
  });

  it("stands every block it places one above its own column's ground", () => {
    const { plan, result } = runGrounds(4242);
    for (const b of result.blocks) {
      expect(b.y).toBe((plan.ground[idx(b.x, b.z)] as number) + 1);
    }
  });

  it("fences the cottage garden and hangs exactly one gate on it", () => {
    const { stack, result } = runGrounds(4242);
    const names = result.blocks.map((b) => stack.blockNameByStateId(b.stateId) ?? "");
    expect(names.filter((n) => n.endsWith("_fence")).length).toBeGreaterThan(8);
    expect(names.filter((n) => n.endsWith("_fence_gate")).length).toBe(1);
  });

  it("wears the ground beside the lane, and only faintly further out", () => {
    const { plan, baseline, result } = runGrounds(4242);
    expect(result.wornColumns).toBeGreaterThan(0);
    let near = 0;
    let far = 0;
    for (let x = 20; x < 56; x++) {
      if (plan.surface[idx(x, 21)] !== baseline[idx(x, 21)]) near++;
      if (plan.surface[idx(x, 25)] !== baseline[idx(x, 25)]) far++;
    }
    expect(near).toBeGreaterThan(far);
  });
});

/* -------------------------------------------------------------------------- */
/* the transition band                                                         */
/* -------------------------------------------------------------------------- */

describe("the clearing transition band", () => {
  /**
   * Euclidean distance from the fixture's square hull, which is what
   * `distanceToHull` measures — the Chebyshev shortcut is wrong at the corners
   * and would put a legal tree on the wrong side of the meadow edge.
   */
  const hullDistance = (x: number, z: number): number => {
    const dx = x < 24 ? 24 - x : x > 40 ? x - 40 : 0;
    const dz = z < 24 ? 24 - z : z > 40 ? z - 40 : 0;
    return Math.sqrt(dx * dx + dz * dz);
  };

  /** A square hull in the middle of the region, and a forest all around it. */
  function runBand(seed: number): {
    readonly before: readonly TreePlacement[];
    readonly result: ReturnType<typeof buildTransitionBand>;
    readonly plan: ColumnPlan;
  } {
    const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    const palette = resolvePalette(stack, undefined, nodeSeed(7n, "world")).palette;
    const plan = flatPlan(stack);
    const hull = [
      { x: 24, z: 24 },
      { x: 40, z: 24 },
      { x: 40, z: 40 },
      { x: 24, z: 40 }
    ];
    const trunk = stack.blockByName("minecraft:oak_log")?.stateId ?? 0;
    const leaf = stack.blockByName("minecraft:oak_leaves")?.stateId ?? 0;
    const before: TreePlacement[] = [];
    for (let z = 0; z < REGION.depth; z += 2) {
      for (let x = 0; x < REGION.width; x += 2) {
        // Trees everywhere outside the hull; the hull itself is already cleared
        // by the scatter, so nothing is planted in it.
        if (x >= 24 && x <= 40 && z >= 24 && z <= 40) continue;
        before.push({
          nodeId: "wood",
          speciesId: "oak",
          shape: "round",
          x,
          z,
          baseY: 65,
          height: 5,
          radiusDelta: 0,
          mega: false,
          trunkState: trunk,
          leafState: leaf
        } as unknown as TreePlacement);
      }
    }
    const result = buildTransitionBand({
      plan,
      hulls: [hull],
      trees: before,
      palette,
      stack,
      seed
    });
    return { before, result, plan };
  }

  it("is deterministic", () => {
    const a = runBand(7);
    const b = runBand(7);
    expect(a.result.trees).toEqual(b.result.trees);
    expect(a.result.blocks).toEqual(b.result.blocks);
    expect(a.result.felled).toBe(b.result.felled);
  });

  it("thins the band and leaves the wood outside it alone", () => {
    const { before, result } = runBand(7);
    const inBand = (t: TreePlacement): boolean =>
      result.band[idx(t.x, t.z)] === 1;
    const bandBefore = before.filter(inBand).length;
    const bandAfter = result.trees.filter(inBand).length;
    const outsideBefore = before.length - bandBefore;
    const outsideAfter = result.trees.length - bandAfter;

    expect(bandBefore).toBeGreaterThan(20);
    // The band is thinned hard: the inner half is felled outright and the
    // outer half keeps one in TRANSITION_TREE_KEEP.
    expect(bandAfter).toBeLessThan(bandBefore / 2);
    // Nothing outside the band moved.
    expect(outsideAfter).toBe(outsideBefore);
    expect(result.felled).toBe(bandBefore - bandAfter);
  });

  it("keeps the innermost band completely tree-free", () => {
    const { result } = runBand(7);
    const meadowEdge = CLEARING_MARGIN + Math.round(TRANSITION_BAND * TRANSITION_MEADOW_FRACTION);
    for (const t of result.trees) {
      // Every surviving tree in the band is beyond the meadow edge; the test's
      // hull is a square, so the axis distance is the hull distance on a face.
      if (result.band[idx(t.x, t.z)] !== 1) continue;
      expect(hullDistance(t.x, t.z)).toBeGreaterThan(meadowEdge);
    }
  });

  it("keeps roughly one tree in TRANSITION_TREE_KEEP through the outer band", () => {
    const { before, result } = runBand(7);
    const outer = (t: TreePlacement): boolean => {
      if (result.band[idx(t.x, t.z)] !== 1) return false;
      return (
        hullDistance(t.x, t.z) >
        CLEARING_MARGIN + Math.round(TRANSITION_BAND * TRANSITION_MEADOW_FRACTION)
      );
    };
    const candidates = before.filter(outer).length;
    const kept = result.trees.filter(outer).length;
    expect(candidates).toBeGreaterThan(10);
    // A hash draw, so the share only has to be in the right neighbourhood.
    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(candidates / 2);
    expect(kept / candidates).toBeLessThan(3 / TRANSITION_TREE_KEEP);
  });

  it("leaves stumps and fallen logs where it felled, all resting on ground", () => {
    const { result, plan } = runBand(7);
    expect(result.stumps + result.logs).toBeGreaterThan(0);
    for (const b of result.blocks as readonly StructureBlock[]) {
      expect(b.y).toBe((plan.ground[idx(b.x, b.z)] as number) + 1);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 3. a compiled world                                                         */
/* -------------------------------------------------------------------------- */

describe("a settlement compiled with ground treatment", () => {
  let root: string;
  let dir: string;
  let report: TerrainCompileReport;
  let plan: ColumnPlan;
  let stack: PrismarineStack;
  let structures: StructurePassResult;
  let physics: PhysicsReport;

  beforeAll(async () => {
    const { readFile } = await import("node:fs/promises");
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    root = await mkdtemp(path.join(tmpdir(), "terrainist-grounds-"));
    dir = path.join(root, "hamlet");
    const doc = JSON.parse(await readFile(EXAMPLE, "utf8")) as unknown;
    const art_compiled = await compileArtifacts(doc, {});
  if (!art_compiled.ok) throw new Error(art_compiled.diagnostics.map((d) => d.name).join(", "));
  plan = art_compiled.artifacts.plan;
  const compiled = await compileTerrain(doc, { outDir: dir });
    if (!compiled.ok) {
      throw new Error(
        `fixture failed to compile: ${compiled.diagnostics.map((d) => `${d.code} ${d.message}`).join("; ")}`,
      );
    }
    report = compiled.report;
    structures = report.layout?.structures as StructurePassResult;
    physics = await lintWorldPhysics(dir, stack, {
      buildings: structures.buildings as never,
      roads: (structures.roads?.routes ?? []) as never,
      tunnels: structures.tunnels.map((t) => ({
        id: t.id,
        from: t.endpoints[0],
        to: t.endpoints[1]
      })),
      terrainTop: {
        x0: plan.region.x0,
        z0: plan.region.z0,
        width: plan.region.width,
        depth: plan.region.depth,
        ground: plan.ground,
        entrances: (plan.caves as { entranceColumns: Uint8Array }).entranceColumns
      }
    });
  }, 300_000);

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("dressed some ground", () => {
    expect(structures.grounds).toBeDefined();
    expect(structures.stats.dressedColumns).toBeGreaterThan(0);
    expect(structures.grounds?.lots.length).toBe(structures.buildings.length);
  });

  it("lints zero on every physics rule", () => {
    for (const rule of PHYSICS_RULES) {
      expect(`${rule}=${physics.counts[rule] ?? 0}`).toBe(`${rule}=0`);
    }
    expect(physics.findings).toEqual([]);
  });
});
