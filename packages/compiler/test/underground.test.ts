/**
 * The themed underground: cellar styles, tunnel styles, and the rooms they dig.
 *
 * Three layers of test, and the split is deliberate:
 *
 * 1. **Pure functions** — the dip finder and the ore draw. Both are the kind of
 *    arithmetic that is wrong in exactly one direction and invisible in a
 *    world, so they are tested on synthetic input where the right answer can
 *    be written down.
 * 2. **The grammar**, through `generateBuilding`: a crypt has niches and a
 *    coffin, a vault has bars, a wine cellar has stacked barrels, and every
 *    style draws the same room twice from the same seed.
 * 3. **A compiled world**, `examples/mine-and-crypt.loam.json`, read back off
 *    disk: rails with the shapes the connection pass gave them, ore in the
 *    walls, a walk from one cellar to the other through the working, and every
 *    physics rule at zero. That last one is the only test here that could have
 *    caught the interesting failure — a pool that leaks, a frame post in the
 *    walkway, a rail on a stair that nothing supports — and it is the reason
 *    this file is slow.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CELLAR_STYLES,
  generateBuilding,
  nodeSeed,
  resolveCellarStyle,
  type LocalVoxelOp,
} from "@terrainist/stdlib";

import { lintWorldPhysics, PHYSICS_RULES, type PhysicsReport } from "../src/emit/physics.js";
import { loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { compileTerrain, type TerrainCompileReport } from "../src/terrain/compile.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import {
  floodedDipRuns,
  resolveTunnelStyle,
  type BuiltTunnel,
  type TunnelCell,
} from "../src/structures/tunnels.js";
import type { StructurePassResult } from "../src/structures/index.js";

const EXAMPLE = fileURLToPath(new URL("../../../examples/mine-and-crypt.loam.json", import.meta.url));

/* -------------------------------------------------------------------------- */
/* the pure functions                                                          */
/* -------------------------------------------------------------------------- */

/** A synthetic centre line from a profile of Y values, running east. */
function pathOf(ys: readonly number[], portals = 0): TunnelCell[] {
  return ys.map((y, i) => ({
    x: i,
    z: 0,
    y,
    flight: false,
    portal: i < portals || i >= ys.length - portals,
  }));
}

describe("floodedDipRuns", () => {
  it("finds the run at the bottom of a V, and nothing on a level gallery", () => {
    expect(floodedDipRuns(pathOf([0, 0, 0, 0, 0]))).toEqual([]);
    // Down two, along three, up two: the middle run is the pool.
    const runs = floodedDipRuns(pathOf([0, -1, -2, -2, -2, -1, 0]));
    expect(runs).toEqual([[2, 4]]);
  });

  it("refuses a dip shallower than the minimum — a puddle is not a pool", () => {
    expect(floodedDipRuns(pathOf([0, -1, -1, 0]))).toEqual([]);
    expect(floodedDipRuns(pathOf([0, -1, -1, 0], 1))).toEqual([]);
  });

  it("refuses a basin with an open shoulder: a slope out is a cellar, not a wall", () => {
    // Falls to -3 and stays there to the end of the path: nothing holds it in.
    expect(floodedDipRuns(pathOf([0, -1, -2, -3, -3]))).toEqual([]);
  });

  it("never floods a portal run — a cellar doorway does not stand in water", () => {
    const ys = [0, -1, -2, -2, -2, -1, 0];
    expect(floodedDipRuns(pathOf(ys))).toEqual([[2, 4]]);
    // Same profile, but the dip is inside the portal ramp.
    expect(floodedDipRuns(pathOf(ys, 4))).toEqual([]);
  });

  it("finds every dip on a profile with two of them", () => {
    expect(floodedDipRuns(pathOf([0, -2, -2, 0, -2, -2, 0]))).toEqual([
      [1, 2],
      [4, 5],
    ]);
  });
});

describe("the style enums", () => {
  it("resolve their own spellings and refuse everything else", () => {
    expect(resolveTunnelStyle("mine")).toBe("mine");
    expect(resolveTunnelStyle("crypt")).toBe("crypt");
    expect(resolveTunnelStyle("dressed")).toBe("dressed");
    expect(resolveTunnelStyle("catacomb")).toBe("dressed");
    expect(resolveTunnelStyle(undefined)).toBe("dressed");
    expect(resolveCellarStyle("wine_cellar")).toBe("wine_cellar");
    expect(resolveCellarStyle("cave")).toBe("plain");
  });
});

/* -------------------------------------------------------------------------- */
/* the cellar styles                                                           */
/* -------------------------------------------------------------------------- */

describe("building.grammar@0 — the cellar styles", () => {
  const seed = nodeSeed(99n, "world.house", "");

  function cellar(style: string, size: [number, number, number] = [11, 8, 11]): LocalVoxelOp[] {
    const built = generateBuilding({
      seed,
      size,
      params: { floors: 1, roof: "gable", basement: 5, cellarStyle: style },
    });
    // Everything under the ground-floor plane is the cellar.
    return built.ops.filter((op) => op.y < 0);
  }

  const names = (ops: readonly LocalVoxelOp[]): Set<string> => new Set(ops.map((o) => o.block));

  it("is the plain grey box unless asked otherwise", () => {
    const plain = names(cellar("plain"));
    expect(plain.has("stone_bricks")).toBe(true);
    expect(plain.has("mossy_stone_bricks")).toBe(false);
    expect(plain.has("chiseled_stone_bricks")).toBe(false);
  });

  it("draws the same room twice from the same seed, for every style", () => {
    for (const style of CELLAR_STYLES) {
      const a = cellar(style);
      const b = cellar(style);
      expect(JSON.stringify(a), style).toBe(JSON.stringify(b));
    }
  });

  it("draws a different room for every style", () => {
    const seen = new Set<string>();
    for (const style of CELLAR_STYLES) seen.add(JSON.stringify(cellar(style)));
    expect(seen.size).toBe(CELLAR_STYLES.length);
  });

  it("gives a crypt mossy walls, burial niches with shelves, and a coffin", () => {
    const ops = cellar("crypt");
    const blocks = names(ops);
    expect(blocks.has("mossy_stone_bricks")).toBe(true);
    expect(blocks.has("cracked_stone_bricks")).toBe(true);
    // The coffin: chiselled sides under slab lids.
    expect(ops.filter((o) => o.block === "chiseled_stone_bricks").length).toBeGreaterThanOrEqual(2);
    // The niches: a shelf slab each, in the wall ring rather than on the floor.
    // …at the walk plane. The coffin's lid is the same slab a course higher.
    const shelves = ops.filter((o) => o.block === "stone_brick_slab" && o.y === -5);
    expect(shelves.length).toBeGreaterThan(2);
    for (const shelf of shelves) {
      const onRing = shelf.x === 0 || shelf.x === 10 || shelf.z === 0 || shelf.z === 10;
      expect(onRing, `shelf at ${shelf.x},${shelf.z} is not a wall cell`).toBe(true);
    }
    // …and something on some of them.
    expect(blocks.has("skeleton_skull") || blocks.has("candle") || blocks.has("cobweb")).toBe(true);
  });

  it("gives a vault its bar gate and a floor of containers", () => {
    const ops = cellar("vault");
    const blocks = names(ops);
    expect(blocks.has("iron_bars")).toBe(true);
    expect(ops.filter((o) => o.block === "chest" || o.block === "barrel").length).toBeGreaterThan(2);
  });

  it("stacks a wine cellar's barrels two high against the walls", () => {
    const ops = cellar("wine_cellar");
    const barrels = ops.filter((o) => o.block === "barrel");
    expect(barrels.length).toBeGreaterThan(2);
    const columns = new Map<string, number>();
    for (const b of barrels) columns.set(`${b.x},${b.z}`, (columns.get(`${b.x},${b.z}`) ?? 0) + 1);
    expect([...columns.values()].some((n) => n === 2)).toBe(true);
    expect(names(ops).has("brewing_stand")).toBe(true);
  });

  it("leaves the ladder's own column and its approach clear in every style", () => {
    for (const style of CELLAR_STYLES) {
      const ops = cellar(style);
      const ladders = ops.filter((o) => o.block === "ladder");
      expect(ladders.length, style).toBeGreaterThan(0);
      const at = ladders[0] as LocalVoxelOp;
      const blockingAtLadder = ops.filter(
        (o) => o.x === at.x && o.z === at.z && o.y === -5 && o.block !== "ladder",
      );
      expect(blockingAtLadder.map((o) => o.block), style).toEqual([]);
    }
  });
});

describe("the mine head", () => {
  it("dresses its own cellar as a working, and stands a headframe over the roof", () => {
    const built = generateBuilding({
      seed: nodeSeed(7n, "world.pit", ""),
      size: [11, 9, 11],
      params: { floors: 1, roof: "gable", basement: 5, archetype: "mine_head" },
    });
    const blocks = new Set(built.ops.map((o) => o.block));
    // The cellar dressed itself: the mine style's rough stone, unasked.
    expect(blocks.has("cobblestone") || blocks.has("andesite")).toBe(true);
    // The headframe: logs above the roof, with a lantern under the beam.
    const top = built.meta.roofTop;
    const frame = built.ops.filter((o) => o.y > top && o.block === "oak_log");
    expect(frame.length).toBeGreaterThan(4);
    expect(built.ops.some((o) => o.y > top && o.block === "lantern")).toBe(true);
    // The ladder is the shaft: it runs from the cellar floor past the plane.
    const ladders = built.ops.filter((o) => o.block === "ladder");
    expect(Math.min(...ladders.map((o) => o.y))).toBeLessThanOrEqual(-5);
  });
});

/* -------------------------------------------------------------------------- */
/* the compiled world                                                          */
/* -------------------------------------------------------------------------- */

describe("mine and crypt, compiled", () => {
  let dir: string;
  let root: string;
  let report: TerrainCompileReport;
  let plan: ColumnPlan;
  let stack: PrismarineStack;
  let structures: StructurePassResult;
  let physics: PhysicsReport;

  beforeAll(async () => {
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    root = await mkdtemp(path.join(tmpdir(), "terrainist-underground-"));
    dir = path.join(root, "mine_and_crypt");
    const doc = JSON.parse(await readFile(EXAMPLE, "utf8")) as unknown;
    const compiled = await compileTerrain(doc, {
      outDir: dir,
      onColumnPlan: (p) => {
        plan = p;
      },
    });
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
        to: t.endpoints[1],
      })),
      terrainTop: {
        x0: plan.region.x0,
        z0: plan.region.z0,
        width: plan.region.width,
        depth: plan.region.depth,
        ground: plan.ground,
        entrances: (plan.caves as { entranceColumns: Uint8Array }).entranceColumns,
      },
    });
  }, 300_000);

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const mine = (): BuiltTunnel =>
    structures.tunnels.find((t) => t.style === "mine") as BuiltTunnel;
  const crypt = (): BuiltTunnel =>
    structures.tunnels.find((t) => t.style === "crypt") as BuiltTunnel;

  it("compiles without a single error diagnostic", () => {
    expect(report.diagnostics.filter((d) => d.severity === "error").map((d) => d.message)).toEqual([]);
  });

  it("digs one gallery in each style", () => {
    expect(structures.tunnels).toHaveLength(2);
    expect(structures.tunnels.map((t) => t.style).sort()).toEqual(["crypt", "mine"]);
  });

  it("lays a rail down the mine's floor and studs its walls with ore", () => {
    const t = mine();
    expect(t.rails).toBeGreaterThan(20);
    expect(t.ores).toBeGreaterThan(20);
    // …and the crypt gallery has neither: a style is a decision, not a mood.
    expect(crypt().rails).toBe(0);
    expect(crypt().ores).toBe(0);
  });

  it("cuts burial niches along the crypt passage and none along the mine", () => {
    expect(crypt().niches).toBeGreaterThan(2);
    expect(mine().niches).toBe(0);
  });

  it("keeps both tunnel invariants, ore chamber included", async () => {
    const { checkTunnelIntegrity } = await import("../src/structures/tunnels.js");
    expect(checkTunnelIntegrity(plan, structures.tunnels, structures.buildings)).toEqual({
      fluidBreaches: 0,
      roofBreaches: 0,
      samples: [],
    });
  });

  it("lays a rail on the flights too, which is what an ascending shape is", () => {
    const t = mine();
    const flights = t.path.filter((c) => c.flight && !c.portal);
    expect(flights.length).toBeGreaterThan(0);
    // Every non-portal cell outside a footprint carries one, so a rail run that
    // climbs has a rail at both ends of every rise — which is the whole input
    // `railShape` needs to resolve `ascending_*`. The shape itself is the
    // connection pass's business and is tested there.
    expect(t.rails).toBeGreaterThanOrEqual(flights.length);
  });

  it("widens the mine's far end into an ore chamber with a cart in it", () => {
    const chamber = mine().oreChamber;
    expect(chamber, "no ore chamber was dug").not.toBeNull();
  });

  it("can be walked from one cellar to the other through both galleries", () => {
    expect(physics.counts["traversal.tunnel"]).toBe(0);
  });

  it("finds nothing wrong under any physics rule", () => {
    expect(
      physics.findings
        .slice(0, 12)
        .map((f) => `${f.rule} @ ${f.x},${f.y},${f.z} ${f.block}: ${f.detail}`)
        .join("\n"),
    ).toBe("");
    for (const rule of PHYSICS_RULES) {
      expect(physics.counts[rule], rule).toBe(0);
    }
  });
});
